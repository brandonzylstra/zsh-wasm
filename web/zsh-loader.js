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

const ZSH_FS = (window.ZshWasmConfig?.fs ?? 'memfs').toLowerCase();
const IDBFS_MOUNT = '/home/user';

// Zsh functions that replace common external binaries (which require fork/exec, unavailable in wasm).
const BUILTINS_PREAMBLE = `\
touch() { local f; for f; do : >> "$f"; done }
cat()   { local f; for f; do print -r -- "$(<$f)"; done }
wc() {
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    printf '%7d %s\\n' \${#lines} "$f"
  done
}
head() {
  local n=10
  [[ $1 == -[0-9]* ]] && n=\${1#-} && shift
  [[ $1 == -n      ]] && n=$2      && shift 2
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    print -l -- \${lines[1,$n]}
  done
}
tail() {
  local n=10
  [[ $1 == -[0-9]* ]] && n=\${1#-} && shift
  [[ $1 == -n      ]] && n=$2      && shift 2
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    print -l -- \${lines[-$n,-1]}
  done
}
grep() {
  local pat=$1; shift
  local f line
  for f; do
    while IFS= read -r line; do
      [[ $line =~ $pat ]] && print -- "$line"
    done < "$f"
  done
}
_ls_modestr() {
  local m=$1 t p=''
  if   (( (m & 0170000) == 0040000 )); then t=d
  elif (( (m & 0170000) == 0120000 )); then t=l
  elif (( (m & 0170000) == 0100000 )); then t=-
  elif (( (m & 0170000) == 0060000 )); then t=b
  elif (( (m & 0170000) == 0020000 )); then t=c
  elif (( (m & 0170000) == 0010000 )); then t=p
  else t='?'
  fi
  local -a ms=(0400 0200 0100 0040 0020 0010 0004 0002 0001)
  local -a cs=(r    w    x    r    w    x    r    w    x   )
  local i
  for (( i=1; i<=9; i++ )); do (( m & ms[i] )) && p+=$cs[i] || p+='-'; done
  print -- "$t$p"
}
ls() {
  local show_all=0 long=0 recursive=0
  local -a args
  for a; do
    if [[ $a == -* ]]; then
      [[ $a == *[aA]* ]] && show_all=1
      [[ $a == *l*   ]] && long=1
      [[ $a == *R*   ]] && recursive=1
    else
      args+=($a)
    fi
  done
  local d=\${args[1]:-.}
  local -a files
  if   (( recursive && show_all )); then files=($d/**/*(DN))
  elif (( recursive ));             then files=($d/**/*(N))
  elif (( show_all ));              then files=($d/*(DN))
  else                                   files=($d/*(N))
  fi
  (( long )) && zmodload zsh/datetime 2>/dev/null
  local f name mode size mtime
  for f in $files; do
    (( recursive )) && name="\${f#\${d%/}/}" || name="\${f:t}"
    if (( long )); then
      mode=$(zstat +mode "$f")
      size=$(zstat +size "$f")
      mtime=$(zstat +mtime "$f")
      printf '%s %6d %s %s\\n' "$(_ls_modestr $mode)" "$size" "$(strftime '%b %e %H:%M' $mtime)" "$name"
    else
      print $name
    fi
  done
}
cp() { print -r -- "$(<$1)" > "$2" }
mv() { cp "$1" "$2" && zf_rm "$1" }
`;

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

    if (ZSH_FS === 'idbfs') {
        try { module.FS.mkdir('/home'); } catch(e) {}
        try { module.FS.mkdir(IDBFS_MOUNT); } catch(e) {}
        module.FS.mount(module.FS.filesystems['IDBFS'], {}, IDBFS_MOUNT);
        await new Promise((res, rej) =>
            module.FS.syncfs(true, err => err ? rej(err) : res()));
    }

    module.FS.writeFile('/script', BUILTINS_PREAMBLE + src + '\n');
    module.callMain(['/script']);

    if (ZSH_FS === 'idbfs') {
        await new Promise((res, rej) =>
            module.FS.syncfs(false, err => err ? rej(err) : res()));
    }

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
