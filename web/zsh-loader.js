// CodeMirror 5 is loaded as a global via <script> tags in index.html.
// type="module" is kept for top-level await support and for the import below.
import { ansiToHtml, runZshScript as coreRun } from './zsh-runtime.js';

// ── zsh-wasm lint checker ──────────────────────────────────────────────────
// Flags shell constructs and external commands that won't work in zsh-wasm.

const LINT_KNOWN_BAD = new Set([
    // Language runtimes
    'python', 'python3', 'python2', 'ruby', 'perl', 'lua', 'php',
    'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun', 'deno',
    'java', 'javac', 'mvn', 'gradle', 'kotlin', 'kotlinc',
    'go', 'cargo', 'rustc', 'swift', 'dotnet',
    // Version control
    'git', 'svn', 'hg', 'fossil',
    // Network
    'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'ftp',
    'ping', 'telnet', 'netcat', 'nc', 'nmap',
    // Archives (not shimmed)
    'tar', 'gzip', 'gunzip', 'bzip2', 'bunzip2', 'xz', 'unxz',
    'zip', 'unzip', '7z',
    // Build tools / compilers
    'make', 'cmake', 'ninja', 'meson', 'autoconf', 'automake',
    'gcc', 'g++', 'clang', 'clang++', 'cc', 'ld', 'ar',
    // Package managers
    'apt', 'apt-get', 'dpkg', 'yum', 'dnf', 'rpm', 'pacman',
    'pip', 'pip3', 'gem', 'composer',
    // System / privilege
    'sudo', 'su', 'doas', 'chown', 'chgrp', 'useradd', 'passwd',
    'mount', 'umount', 'lsblk', 'fdisk',
    'ps', 'top', 'htop', 'pkill', 'pgrep', 'lsof',
    'systemctl', 'service', 'journalctl', 'dmesg',
    'ifconfig', 'ip', 'netstat', 'ss',
    // Pagers / editors (interactive)
    'less', 'more', 'man', 'info',
    'vim', 'vi', 'nano', 'emacs', 'ed',
    // Diff / patch
    'patch', 'diff',
    // Containers / cloud
    'docker', 'podman', 'kubectl', 'helm', 'terraform',
    'aws', 'gcloud', 'az',
    // Media
    'ffmpeg', 'ffprobe', 'convert', 'magick',
    // Other common tools not shimmed
    'jq', 'yq', 'fx',
    'open', 'xdg-open',
    'pbcopy', 'pbpaste', 'xclip', 'xsel',
]);

const LINT_KEYWORDS = new Set([
    'if', 'then', 'else', 'elif', 'fi',
    'while', 'until', 'for', 'select', 'do', 'done',
    'case', 'esac', 'in', 'function', 'time', '!',
    '{', '}', '[[', ']]',
]);

/** Is the character at `pos` inside a single or double quote? (simplified) */
function lintInQuote(line, pos) {
    let single = false, double = false;
    for (let i = 0; i < pos; i++) {
        const c = line[i];
        if (c === '\\' && !single) { i++; continue; }
        if (c === "'" && !double) { single = !single; continue; }
        if (c === '"' && !single) { double = !double; continue; }
    }
    return single || double;
}

/**
 * Split a line into command-position segments on ;, &&, ||, | (outside quotes).
 * Returns [{text, offset}] where offset is the char index in the original line.
 */
function lintSegments(line) {
    const segs = [];
    let single = false, double = false;
    let start = 0;
    let i = 0;
    while (i < line.length) {
        const c = line[i];
        if (c === '\\' && !single) { i += 2; continue; }
        if (c === "'" && !double) { single = !single; i++; continue; }
        if (c === '"' && !single) { double = !double; i++; continue; }
        if (!single && !double) {
            if (c === '#') {
                // rest is comment
                segs.push({ text: line.slice(start, i), offset: start });
                return segs;
            }
            const two = line.slice(i, i + 2);
            if (two === '&&' || two === '||') {
                segs.push({ text: line.slice(start, i), offset: start });
                start = i + 2; i += 2; continue;
            }
            if (c === ';') {
                segs.push({ text: line.slice(start, i), offset: start });
                start = i + 1; i++; continue;
            }
            if (c === '|' && line[i + 1] !== '|' && line[i + 1] !== '&') {
                segs.push({ text: line.slice(start, i), offset: start });
                start = i + 1; i++; continue;
            }
        }
        i++;
    }
    segs.push({ text: line.slice(start), offset: start });
    return segs;
}

/**
 * For each command-position segment, return the first command-name word.
 * Skips shell keywords and variable assignments (WORD=...).
 */
function lintCommandNames(line) {
    const results = [];
    for (const { text, offset } of lintSegments(line)) {
        // Scan past leading whitespace
        let i = 0;
        while (i < text.length && /\s/.test(text[i])) i++;
        if (i >= text.length) continue;

        // Extract identifier-like word
        const m = text.slice(i).match(/^([A-Za-z][A-Za-z0-9_+.-]*)/);
        if (!m) continue;
        const word = m[1];

        // Skip keywords, ALL_CAPS (likely env var names), and VAR= assignments
        if (LINT_KEYWORDS.has(word)) continue;
        if (/^[A-Z_][A-Z0-9_]*$/.test(word)) continue;
        if (text.slice(i + word.length, i + word.length + 1) === '=') continue;

        results.push({ name: word, col: offset + i });
    }
    return results;
}

/** Main lint function passed to CodeMirror. */
function zshWasmLint(text) {
    const diags = [];
    const lines = text.split('\n');

    for (let ln = 0; ln < lines.length; ln++) {
        const line = lines[ln];
        if (/^\s*#/.test(line)) continue;  // pure comment line

        let m;

        // Process substitution <(…) or >(…) — requires fork
        const psRe = /[<>]\(/g;
        while ((m = psRe.exec(line)) !== null) {
            if (lintInQuote(line, m.index)) continue;
            diags.push({
                from: CodeMirror.Pos(ln, m.index),
                to:   CodeMirror.Pos(ln, m.index + 2),
                severity: 'error',
                message: 'Process substitution <(…)/>(…) requires fork() — not supported in zsh-wasm.\n'
                       + 'Write output to a temp file and read it, or use a here-string <<<.',
            });
        }

        // |& — pipe stdout+stderr — requires fork
        const pipeErrRe = /\|&/g;
        while ((m = pipeErrRe.exec(line)) !== null) {
            if (lintInQuote(line, m.index)) continue;
            diags.push({
                from: CodeMirror.Pos(ln, m.index),
                to:   CodeMirror.Pos(ln, m.index + 2),
                severity: 'error',
                message: '|& (pipe stdout+stderr) requires fork() — not supported in zsh-wasm.\n'
                       + 'Redirect stderr to a file explicitly: 2>/tmp/err.',
            });
        }

        // Background job & (not && and not |& and not &>)
        const bgRe = /(?<![|&])&(?![&|>])/g;
        while ((m = bgRe.exec(line)) !== null) {
            if (lintInQuote(line, m.index)) continue;
            // Skip if it's after the comment marker on this line
            const cIdx = line.indexOf('#');
            if (cIdx >= 0 && cIdx < m.index) continue;
            diags.push({
                from: CodeMirror.Pos(ln, m.index),
                to:   CodeMirror.Pos(ln, m.index + 1),
                severity: 'error',
                message: 'Background jobs (&) are not supported in zsh-wasm — there is no job control.\n'
                       + 'Run commands sequentially, or use a worker pool for parallel execution.',
            });
        }

        // Known-unavailable external commands
        for (const { name, col } of lintCommandNames(line)) {
            if (LINT_KNOWN_BAD.has(name)) {
                diags.push({
                    from: CodeMirror.Pos(ln, col),
                    to:   CodeMirror.Pos(ln, col + name.length),
                    severity: 'warning',
                    message: `'${name}' is an external binary not available in zsh-wasm.\n`
                           + 'Available commands: zsh builtins, awk, sed, bc, grep, sort, find, '
                           + 'cat, ls, cp, mv, rm, wc, head, tail, cut, tr, date, seq, base64, and more.\n'
                           + 'See the README shim table for the full list.',
                });
            }
        }
    }

    return diags;
}

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
            lint:           zshWasmLint,
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
