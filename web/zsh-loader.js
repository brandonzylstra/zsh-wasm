// CodeMirror 5 is loaded as a global via <script> tags in index.html.
// type="module" is kept only for top-level await support.

function ansiToHtml(text) {
    // Escape HTML entities first so we can safely inject spans.
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // GitHub-dark palette mapped to standard ANSI color codes.
    const fg = {
        30:'#484f58', 31:'#ff7b72', 32:'#3fb950', 33:'#e3b341',
        34:'#58a6ff', 35:'#bc8cff', 36:'#39c5cf', 37:'#b1bac4',
        90:'#6e7681', 91:'#ffa198', 92:'#56d364', 93:'#e3b341',
        94:'#79c0ff', 95:'#d2a8ff', 96:'#56d8e4', 97:'#f0f6fc',
    };
    const bg = {
        40:'#161b22', 41:'#ff7b72', 42:'#3fb950', 43:'#e3b341',
        44:'#58a6ff', 45:'#bc8cff', 46:'#39c5cf', 47:'#b1bac4',
    };

    let depth = 0;
    const result = text.replace(/\x1b\[([0-9;]*)m/g, (_, seq) => {
        const codes = seq.split(';').map(Number);
        let out = '';
        for (const c of codes) {
            if (c === 0) {
                out += '</span>'.repeat(depth);
                depth = 0;
            } else {
                const style = c === 1 ? 'font-weight:bold'
                            : c === 2 ? 'opacity:0.5'
                            : c === 3 ? 'font-style:italic'
                            : c === 4 ? 'text-decoration:underline'
                            : fg[c]   ? `color:${fg[c]}`
                            : bg[c]   ? `background:${bg[c]}`
                            : '';
                if (style) { out += `<span style="${style}">`; depth++; }
            }
        }
        return out;
    });
    return result + '</span>'.repeat(depth);
}

function isRuntimeNoise(txt) {
    return txt.startsWith('warning: unsupported syscall:') ||
           txt.startsWith('program exited (with status:');
}

async function runZshScript(src, stdout, stderr) {
    var opts = { noInitialRun: true };

    const outEl = stdout ? document.querySelector(stdout) : null;
    if (outEl) {
        outEl.innerHTML = '';
        outEl.classList.remove('revealed');
        outEl.classList.add('loading');
        opts.print = txt => { outEl.innerHTML += ansiToHtml(txt) + '\n'; };
    }

    if (stderr) {
        const errEl = document.querySelector(stderr);
        if (errEl) {
            opts.printErr = txt => { if (!isRuntimeNoise(txt)) errEl.innerHTML += ansiToHtml(txt) + '\n'; };
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

    if (s.dataset.autoRun === 'true') {
        await runZshScript(editor ? editor.getValue() : s.textContent, stdout, stderr);
    }
}
