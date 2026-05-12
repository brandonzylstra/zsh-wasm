// CodeMirror 5 is loaded as a global via <script> tags in index.html.
// type="module" is kept only for top-level await support.

function isRuntimeNoise(txt) {
    return txt.startsWith('warning: unsupported syscall:') ||
           txt.startsWith('program exited (with status:');
}

async function runZshScript(src, stdout, stderr) {
    var opts = { noInitialRun: true };

    const outEl = stdout ? document.querySelector(stdout) : null;
    if (outEl) {
        outEl.textContent = '';
        outEl.classList.remove('revealed');
        outEl.classList.add('loading');
        opts.print = txt => { outEl.textContent += txt + '\n'; };
    }

    if (stderr) {
        const errEl = document.querySelector(stderr);
        if (errEl) {
            opts.printErr = txt => { if (!isRuntimeNoise(txt)) errEl.textContent += txt + '\n'; };
        }
    } else {
        opts.printErr = txt => { if (!isRuntimeNoise(txt)) console.error(txt); };
    }

    var module = await createZshModule(opts);
    module.FS.writeFile('/script', src + '\n');
    module.callMain(['/script']);

    if (outEl) {
        outEl.classList.remove('loading');
        outEl.classList.add('revealed');
    }
}

for (const s of document.querySelectorAll('script[type="text/zsh"]')) {
    const id     = s.dataset.id;
    const stdout = s.dataset.stdout;
    const stderr = s.dataset.stderr;
    const pre    = document.getElementById('src-' + id);

    let editor;
    if (pre) {
        pre.innerHTML = '';
        editor = CodeMirror(pre, {
            value:          s.textContent.trim(),
            mode:           'shell',
            theme:          'zsh-wasm',
            lineNumbers:    false,
            lineWrapping:   false,
            viewportMargin: Infinity,
        });

        const header = pre.closest('.example')?.querySelector('.example-header');
        if (header) {
            const controls = document.createElement('div');
            controls.className = 'header-controls';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'hdr-btn copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(editor.getValue()).then(() => {
                    copyBtn.textContent = 'Copied!';
                    copyBtn.classList.add('copied');
                    setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
                });
            });

            const runBtn = document.createElement('button');
            runBtn.className = 'hdr-btn run-btn';
            runBtn.textContent = '▶ Run';
            runBtn.addEventListener('click', async () => {
                if (runBtn.dataset.busy) return;
                runBtn.dataset.busy = '1';
                runBtn.textContent = 'Running…';
                await runZshScript(editor.getValue(), stdout, stderr);
                delete runBtn.dataset.busy;
                runBtn.textContent = '▶ Run';
            });

            controls.append(copyBtn, runBtn);
            header.appendChild(controls);
        }
    }

    await runZshScript(editor ? editor.getValue() : s.textContent, stdout, stderr);
}
