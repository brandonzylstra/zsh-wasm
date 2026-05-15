// Web Worker that runs a single zsh script and posts results back.
// Loaded by zsh-runtime.js via new Worker('./zsh-worker.js').

importScripts('./zsh.js');

self.onmessage = async ({ data: { src, fs, idbfsMount } }) => {
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

    const module = await createZshModule(opts);

    if (fs === 'idbfs') {
        try { module.FS.mkdir('/home'); } catch(e) {}
        try { module.FS.mkdir(idbfsMount); } catch(e) {}
        module.FS.mount(module.FS.filesystems['IDBFS'], {}, idbfsMount);
        await new Promise((res, rej) =>
            module.FS.syncfs(true, err => err ? rej(err) : res()));
    }

    module.FS.writeFile('/script', src);
    module.callMain(['/script']);

    if (fs === 'idbfs') {
        await new Promise((res, rej) =>
            module.FS.syncfs(false, err => err ? rej(err) : res()));
    }

    self.postMessage({ stdout: outLines.join('\n'), stderr: errLines.join('\n') });
};
