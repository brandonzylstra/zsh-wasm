// CodeMirror 5 is loaded as a global via <script> tags in index.html.
// type="module" is kept for top-level await support and for the import below.
import { ansiToHtml, runZshScript as coreRun } from './zsh-runtime.js';

async function runZshScript(src, stdout, stderr, stdin = null) {
    const outEl = stdout ? document.querySelector(stdout) : null;
    const errEl = stderr ? document.querySelector(stderr) : null;

    if (outEl) {
        outEl.innerHTML = '';
        outEl.classList.remove('revealed');
        outEl.classList.add('loading');
    }

    const { stdout: out, stderr: err } = await coreRun(src, { stdin });

    if (outEl) {
        outEl.innerHTML = out ? ansiToHtml(out) + '\n' : '';
        outEl.classList.remove('loading');
        outEl.classList.add('revealed');
    }

    if (errEl) {
        if (err) errEl.innerHTML = ansiToHtml(err) + '\n';
    } else if (err) {
        console.error(err);
    }
}

for (const s of document.querySelectorAll('script[type="text/zsh"]')) {
    const id     = s.dataset.id;
    const stdout = s.dataset.stdout;
    const stderr = s.dataset.stderr;
    const pre    = document.getElementById('src-' + id);

    let stdinArea = null;
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

        if ('stdin' in s.dataset) {
            const outEl = stdout ? document.querySelector(stdout) : null;
            const outPane = outEl?.closest('.pane');
            const body = outPane?.closest('.example-body');
            if (body && outPane) {
                body.classList.add('has-stdin');
                const stdinPane = document.createElement('div');
                stdinPane.className = 'pane';
                stdinPane.innerHTML = '<div class="pane-label">Stdin</div>';
                stdinArea = document.createElement('textarea');
                stdinArea.className = 'stdin-area';
                stdinArea.value = s.dataset.stdin.replace(/\\n/g, '\n');
                stdinPane.appendChild(stdinArea);
                body.insertBefore(stdinPane, outPane);
            }
        }

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
                await runZshScript(editor.getValue(), stdout, stderr, stdinArea?.value ?? null);
                delete runBtn.dataset.busy;
                runBtn.textContent = '▶ Run';
            });

            controls.append(copyBtn, runBtn);
            header.appendChild(controls);
        }
    }

    if (s.dataset.autoRun === 'true') {
        await runZshScript(editor ? editor.getValue() : s.textContent, stdout, stderr, stdinArea?.value ?? null);
    }
}
