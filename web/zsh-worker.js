// Web Worker for zsh-wasm. Pre-initializes a fresh wasm module and signals
// { type: 'ready' } when ready to run a script. On { type: 'run' }, executes
// the script and posts { type: 'result' }, then immediately begins initializing
// the next module — overlapping init with the caller's processing time.
// Each run gets a fully fresh module instance, so zsh state never leaks between calls.

importScripts('./zsh.js');

let _capture = null;
let _module  = null;
let _moduleReady = null; // Promise<module>, resolved when pre-init finishes

function startPreInit() {
    // Fresh capture object — closures below reference this specific instance.
    const capture = { out: [], err: [], stdinFn: null };
    _capture = capture;
    _moduleReady = createZshModule({
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
        // SharedArrayBuffer requires cross-origin isolation (COOP+COEP headers); without
        // it we fall back to a no-op with a stderr diagnostic.
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
                    } else {
                        _capture.err.push(
                            'sleep: real sleep requires cross-origin isolation ' +
                            '(COOP + COEP headers enable SharedArrayBuffer)'
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

// Begin pre-initializing immediately so the first run arrives to a warm module.
startPreInit();

self.onmessage = async ({ data: { src, fs, idbfsMount, stdin } }) => {
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
