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
        opts.printErr = function (txt) { el.textContent += txt + '\n'; };
    }

    var module = await createZshModule(opts);
    const text = src + '\n';
    module.FS.writeFile('/script', text);
    module.callMain(['/script']);
}

globalThis.runZshScript = runZshScript;

const scripts = document.querySelectorAll('script[type="text/zsh"]');
for (const script of scripts) {
    var stdout = script.dataset.stdout;
    var stderr = script.dataset.stderr;
    await runZshScript(script.textContent, stdout, stderr);
}
