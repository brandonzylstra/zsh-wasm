function isRuntimeNoise(txt) {
    return txt.startsWith('warning: unsupported syscall:') ||
           txt.startsWith('program exited (with status:');
}

async function runZshScript(src, stdout, stderr) {
    var opts = {
        noInitialRun: true,
    };

    if (stdout) {
        var el = document.querySelector(stdout);
        if (!el) throw `stdout selector ${stdout} does not exist`;
        opts.print = function (txt) { el.textContent += txt + '\n'; };
    }

    if (stderr) {
        var el = document.querySelector(stderr);
        if (!el) throw `stderr selector ${stderr} does not exist`;
        opts.printErr = function (txt) { if (!isRuntimeNoise(txt)) el.textContent += txt + '\n'; };
    } else {
        opts.printErr = function (txt) { if (!isRuntimeNoise(txt)) console.error(txt); };
    }

    var module = await createZshModule(opts);
    const text = src + '\n';
    module.FS.writeFile('/script', text);
    module.callMain(['/script']);

    if (stdout) {
        var el = document.querySelector(stdout);
        if (el) el.classList.remove('loading');
    }
}

globalThis.runZshScript = runZshScript;

const scripts = document.querySelectorAll('script[type="text/zsh"]');
for (const script of scripts) {
    var stdout = script.dataset.stdout;
    var stderr = script.dataset.stderr;
    await runZshScript(script.textContent, stdout, stderr);
}
