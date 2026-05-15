// Web Worker that runs a single zsh script and posts results back.
// Loaded by zsh-runtime.js via new Worker('./zsh-worker.js').

importScripts('./zsh.js');

self.onmessage = async ({ data: { src, fs, idbfsMount, stdin } }) => {
    const outLines = [];
    const errLines = [];

    const opts = {
        noInitialRun: true,
        print:    txt => outLines.push(txt),
        printErr: txt => {
            if (!txt.startsWith('warning: unsupported syscall:') &&
                !txt.startsWith('program exited (with status:')) {
                errLines.push(txt);
            }
        },
    };

    if (stdin != null) {
        const bytes = new TextEncoder().encode(stdin);
        let pos = 0;
        opts.stdin = () => pos < bytes.length ? bytes[pos++] : null;
    }

    const module = await createZshModule(opts);

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

    self.postMessage({ stdout: outLines.join('\n'), stderr: errLines.join('\n'), exitCode });
};
