// Web Worker for zsh-wasm. Pre-initializes a fresh wasm module and signals
// { type: 'ready' } when ready to run a script. On { type: 'run' }, executes
// the script and posts { type: 'result' }, then immediately begins initializing
// the next module — overlapping init with the caller's processing time.
// Each run gets a fully fresh module instance, so zsh state never leaks between calls.

// The Emscripten loader is NOT pulled in at the top level any more. It used to
// be `importScripts('./zsh.js')`, a plain runtime string, and a bundler cannot
// see through that: building this package with Vite produced a dist/ with no
// zsh.js and no zsh.wasm in it, and the worker died on a 404 for './zsh.js'.
//
// Instead the runtime computes both URLs with `new URL(..., import.meta.url)`,
// which every bundler understands as an asset reference, and sends them here in
// an 'init' message. Loading is deferred until that message arrives, which is
// posted the moment the worker is constructed — so pre-initialization still
// starts immediately and the warm-worker behavior is unchanged.

let _capture          = null;
let _module           = null;
let _moduleReady      = null; // Promise<module>, resolved when pre-init finishes
let _busySleepFallback = false;
let _wasmUrl          = null; // where zsh.wasm actually lives, from the 'init' message
let _runtimeLoaded    = false;

function loadRuntime({ loaderUrl, wasmUrl }) {
    if (_runtimeLoaded) return;
    _runtimeLoaded = true;
    _wasmUrl = wasmUrl || null;
    // The fallback keeps a hand-written worker (or an older caller) working when
    // no URL is supplied: the loader sits next to this file in that case.
    importScripts(loaderUrl || './zsh.js');
    startPreInit();
}

function startPreInit() {
    // Fresh capture object — closures below reference this specific instance.
    const capture = { out: [], err: [], stdinFn: null };
    _capture = capture;
    _moduleReady = createZshModule({
        // Emscripten otherwise derives the wasm path from the loader's own
        // filename, which breaks the moment a bundler content-hashes it
        // (zsh-a1b2c3.js would send it looking for zsh-a1b2c3.wasm).
        ...(_wasmUrl ? { locateFile: path => path.endsWith('.wasm') ? _wasmUrl : path } : {}),
        noInitialRun: true,
        print:    txt => capture.out.push(txt),
        printErr: txt => {
            if (!txt.startsWith('warning: unsupported syscall:') &&
                !txt.startsWith('program exited (with status:')) {
                capture.err.push(txt);
            }
        },
        stdin: () => capture.stdinFn ? capture.stdinFn() : null,
    }).then(mod => {
        _module = mod;
        // Register /dev/wasm_sleep: the sleep shim writes "N" here to sleep N seconds.
        // In a Web Worker, Atomics.wait() is permitted and blocks only the worker thread.
        // Sleep strategy cascade:
        //   1. SharedArrayBuffer available (COOP+COEP) → Atomics.wait (real block, no CPU)
        //   2. busySleepFallback: true in RunOptions → Date.now() spin loop (burns CPU)
        //   3. otherwise → no-op + stderr diagnostic
        try {
            const FS  = mod.FS;
            const dev = FS.makedev(64, 0);
            FS.registerDevice(dev, {
                read:  () => 0,
                write(stream, buffer, offset, length) {
                    const txt  = new TextDecoder().decode(buffer.subarray(offset, offset + length)).trim();
                    const secs = parseFloat(txt);
                    const ms   = isNaN(secs) ? 0 : Math.max(0, Math.round(secs * 1000));
                    if (typeof SharedArrayBuffer !== 'undefined') {
                        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
                    } else if (_busySleepFallback) {
                        const end = Date.now() + ms;
                        while (Date.now() < end) {}
                    } else {
                        _capture.err.push(
                            'sleep: SharedArrayBuffer unavailable (page lacks COOP+COEP headers). ' +
                            'Pass busySleepFallback: true to RunOptions to use a CPU-burning busy-wait instead.'
                        );
                    }
                    return length;
                },
            });
            FS.mkdev('/dev/wasm_sleep', dev);
        } catch(e) {}
        self.postMessage({ type: 'ready' });
        return mod;
    });
}

// Pre-initialization now begins on the 'init' message rather than here, because
// the loader URL arrives with it. The runtime posts it immediately on spawning
// the worker, so in practice this still starts before any script is submitted.

self.onmessage = async ({ data }) => {
    if (data.type === 'init') {
        loadRuntime(data);
        return;
    }

    const { src, fs, idbfsMount, stdin, busySleepFallback } = data;

    // A run can only arrive before 'init' if a caller built the worker itself.
    // Fall back to the adjacent loader rather than hanging forever on a
    // _moduleReady that nothing would ever assign.
    if (!_runtimeLoaded) loadRuntime({});

    _busySleepFallback = !!busySleepFallback;
    await _moduleReady;
    const module  = _module;
    const capture = _capture;

    // Reset output buffers and stdin for this run.
    capture.out = [];
    capture.err = [];
    if (stdin != null) {
        const text  = stdin.endsWith('\n') ? stdin : stdin + '\n';
        const bytes = new TextEncoder().encode(text);
        let pos = 0;
        capture.stdinFn = () => pos < bytes.length ? bytes[pos++] : null;
    } else {
        capture.stdinFn = null;
    }

    if (fs === 'idbfs') {
        try { module.FS.mkdir('/home'); } catch(e) {}
        try { module.FS.mkdir(idbfsMount); } catch(e) {}
        module.FS.mount(module.FS.filesystems['IDBFS'], {}, idbfsMount);
        await new Promise((res, rej) =>
            module.FS.syncfs(true, err => err ? rej(err) : res()));
    }

    module.FS.writeFile('/script', src);

    let exitCode = 0;
    try {
        const ret = module.callMain(['/script']);
        if (typeof ret === 'number') exitCode = ret;
    } catch (e) {
        if (e && typeof e.status === 'number') exitCode = e.status;
        else throw e;
    }

    // Emscripten's tty only hands a line to the print callback when it sees a
    // newline, so output that does not end in one -- `head -c 5`, `printf x` --
    // would sit in the buffer and never arrive. Flush libc first, then the tty.
    try {
        module._fflush?.(0);
        for (const fd of [1, 2]) {
            const stream = module.FS.streams[fd];
            stream?.stream_ops?.fsync?.(stream);
        }
    } catch (e) {}

    if (fs === 'idbfs') {
        await new Promise((res, rej) =>
            module.FS.syncfs(false, err => err ? rej(err) : res()));
    }

    self.postMessage({
        type: 'result',
        stdout: capture.out.join('\n'),
        stderr: capture.err.join('\n'),
        exitCode,
    });

    // Begin pre-initializing the next module while the caller processes this result.
    startPreInit();
};
