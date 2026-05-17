Zsh Wasm
========

Compile the Z Shell for WebAssembly using Emscripten, so it can run inside a browser.

Demo
----

Open `web/index.html` (served via an HTTP server — see below) to see zsh running in the browser.

npm package
-----------

```
npm install zsh-wasm
```

```js
import { runZshScript } from 'zsh-wasm';

const { stdout, stderr } = await runZshScript('echo "Hello from zsh $ZSH_VERSION"');
console.log(stdout); // Hello from zsh 5.9

// Pass stdin
const { stdout: out } = await runZshScript('while IFS= read -r line; do echo "> $line"; done', {
    stdin: 'hello\nworld',
});

// Use IndexedDB-backed persistence (browser only)
const { stdout: files } = await runZshScript('ls /home/user', { fs: 'idbfs' });
```

The package ships `zsh-runtime.js`, `zsh-worker.js`, `zsh.js`, and `zsh.wasm`.
The script runs in a Web Worker so the main thread never blocks.

**Bundler note:** `zsh-runtime.js` spawns a worker via
`new Worker(new URL('./zsh-worker.js', import.meta.url))`, which Vite and
Webpack 5 handle automatically. The `zsh.wasm` binary is loaded by
Emscripten's runtime relative to the JS file — if your bundler moves the wasm,
you may need to configure it to emit wasm as a static asset.

How To Build
------------

### Prerequisites

- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`, `emmake`, `emconfigure`)
- The zsh 5.9 source (`zsh-5.9/` directory — see below)

### 1. Download zsh source

```
curl -L -O https://www.zsh.org/pub/zsh-5.9.tar.xz
tar xf zsh-5.9.tar.xz
```

### 2. Build the ncurses stub

Zsh requires ncurses, which is not available in emscripten's sysroot. We provide a
minimal stub that satisfies the linker. (ZLE is compiled in but its ncurses calls
are no-ops; script execution doesn't use the terminal at all.)

```
cd ncurses-stub
emcc -c ncurses_stub.c -o ncurses_stub.o
emar rcs lib/libncurses.a ncurses_stub.o
cd ..
```

### 3. Configure

```
mkdir -p build-zsh
cd build-zsh
STUB="$(pwd)/../ncurses-stub"
emconfigure ../zsh-5.9/configure \
  --build="$(../zsh-5.9/config.guess)" \
  --host=wasm32-unknown-emscripten \
  --disable-dynamic \
  --without-tcsetpgrp \
  --disable-dynamic-nss \
  CPPFLAGS="-I$STUB/include" \
  LDFLAGS="-L$STUB/lib" \
  LIBS="-lncurses" \
  CFLAGS="-Os"
```

### 4. Patch generated config.h

Two configure tests produce wrong results under emscripten. Use the provided script
(idempotent — safe to run again after any `make prep`):

```
bin/patch-config
```

Also patch the generated build files:

```
# Tell the build system where term.h is
sed -i '' 's/^ZSH_TERM_H = $/ZSH_TERM_H = term.h/' Config/defs.mk

# Regenerate zshterm.h
echo '#include <term.h>' > Src/zshterm.h
```

### 5. Configure modules

#### 5a. Disable ZLE and completion modules

ZLE (the interactive line editor) and the completion system are not usable without
a real terminal, so we exclude them to reduce binary size (~350KB savings).

First, patch the source to remove a spurious dependency on the complete module:

```
# zutil.mdd: remove moddeps="zsh/complete" line
sed -i '' '/^moddeps="zsh\/complete"$/d' ../zsh-5.9/Src/Modules/zutil.mdd

# zutil.c: inline the one call that depended on complete
sed -i '' 's/set_list_array(args\[1\], zstyle_list);/setaparam(args[1], zlinklist2array(zstyle_list, 1));/' \
  ../zsh-5.9/Src/Modules/zutil.c
```

Then deactivate the modules in config.modules:

```
sed -i '' -E \
  -e 's/^(name=zsh\/(zle|compctl|complete|complist|computil|zleparameter) .*)link=static/\1link=no/' \
  -e 's/^(name=zsh\/(zle|compctl|complete|complist|computil|zleparameter) .*)load=yes/\1load=no/' \
  config.modules
```

#### 5b. Enable zsh/files, zsh/stat, and zsh/regex

`zsh/files` provides file-operation builtins (`zf_mkdir`, `zf_rm`, etc.) that work
without forking. `zsh/stat` provides `zstat` for reading file metadata.
`zsh/regex` enables `[[ str =~ pat ]]` and powers the `grep` shim.

```
sed -i '' -E \
  -e 's/^(name=zsh\/(files|stat|regex) .*)link=no/\1link=static/' \
  -e 's/^(name=zsh\/(files|stat|regex) .*)load=no/\1load=yes/' \
  config.modules
```

#### 5c. (Optional) Register zsh/sed for --with-sed builds

If you want to be able to build with `--with-sed` later, add the entry now
(disabled by default — `bin/build --with-sed` flips it to `link=static`):

```
sed -i '' '/^name=zsh\/net\/socket /a\
name=zsh/sed modfile=Src/Modules/sed.mdd link=no auto=yes load=no' \
  config.modules
```

#### 5d. Regenerate Makefiles

```
emmake make prep
```

After `make prep`, re-run `bin/patch-config` — it regenerates `config.h` and wipes the patches:

```
bin/patch-config
```

### 6. Build

```
emmake make \
  LDFLAGS="-L$(pwd)/../ncurses-stub/lib \
    -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain,IDBFS \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createZshModule \
    -lidbfs.js"
```

To build with sed included, compile the sed objects separately and add them at link time:

```
# Compile sed-src/ objects
SED_SRC="$(pwd)/../sed-src"
SED_BUILD="$(pwd)/../build-sed"
mkdir -p "$SED_BUILD"
for src in sed_embed main compile misc process; do
  emcc -Os -c "$SED_SRC/${src}.c" -o "$SED_BUILD/sed_${src}.o" -I"$SED_SRC"
done
emcc -Os -c "$SED_SRC/sed_mod.c" -o "$SED_BUILD/sed_mod.o" \
  -I. -I../Src -I"$(pwd)/../../zsh-5.9/Src" \
  -I"$(pwd)/../../zsh-5.9/Src/Modules" -I"$SED_SRC" -DHAVE_CONFIG_H

# Enable zsh/sed in config.modules, then build
sed -i '' -E \
  -e 's/^(name=zsh\/sed .*)link=no/\1link=static/' \
  -e 's/^(name=zsh\/sed .*)load=no/\1load=yes/' \
  ../config.modules

emmake make \
  CFLAGS="-Os -I$SED_SRC" \
  LDFLAGS="-L$(pwd)/../ncurses-stub/lib \
    -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain,IDBFS \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createZshModule \
    -lidbfs.js \
    $SED_BUILD/sed_mod.o \
    $SED_BUILD/sed_embed.o $SED_BUILD/sed_main.o \
    $SED_BUILD/sed_compile.o $SED_BUILD/sed_misc.o $SED_BUILD/sed_process.o"
```

In practice, `bin/build --with-sed` handles all of the above automatically.

### 7. Deploy to web

```
cp Src/zsh     ../web/zsh.js
cp Src/zsh.wasm ../web/zsh.wasm
cd ..
```

### 8. Test

```
cd web
python3 -m http.server
# open http://localhost:8000/
```

Testing
-------

### Manual

Open `web/test.html` via an HTTP server to run the test suite visually:

```
cd web
python3 -m http.server 8765
# open http://localhost:8765/test.html
```

### Automated (Playwright)

```
npm install
npx playwright install chromium
npx playwright test
```

The Playwright config starts a local HTTP server automatically, loads `test.html`,
and waits for the sentinel attribute `[data-tests-complete]` before checking for
any `[data-test-status="fail"]` elements.

211 test cases pass (212 total; 1 `knownFail` documenting subshell variable isolation). Coverage includes: shell builtins (echo, printf, if, for, while, case, function,
`local` scoping, `$?` exit-status capture), all shims, glob patterns, recursive
globs, stdin, exit codes, POSIX regex via `=~` (anchors, alternation, character
classes, `+`/`?`/`{n}` quantifiers), multi-file grep and wc, grep `-A`/`-B`/`-C` context lines, sort combined flags,
cut open-ended field ranges, sed (substitution, deletion, address ranges, `-n`/`-e`,
`-i ''` in-place, line-addressed print), awk (field splitting, pattern matching,
gsub, sub, NF, NR, FNR, FILENAME, `length()`, `printf`, BEGIN/END, `-v` variables,
`-F` separator, multi-file), `zsh/mathfunc` (sin, cos, sqrt, log, etc.),
basename/dirname path manipulation, rm/rmdir, tee, grep/cat/wc from stdin,
seq, mktemp, sleep, find (`-name`/`-type`/`-maxdepth`/`-newer`), env/printenv, sort `-k` field sort, cut `-c` character positions, string operations (length, slice, replace, strip-prefix/suffix,
`${var:-default}`, upper/lower case), brace expansion, array/associative-array
operations, file-test operators (`-f`/`-d`), append redirect, logical operators,
`$(...)` command substitution, `$(< file)` file substitution, `zf_rm`, `zstat`,
pipe simulation (`a | b` rewritten to temp-file chaining), subshell simulation
(`(cmd)` rewritten to `{ cmd }` at top level), `fork: 'off'` no-pipe path,
`createPool`/parallel execution/`shutdownDefaultPool`, and per-test rerun buttons in the test UI.

Known limitation: subshell variable mutations leak into the outer scope (`(x=inner)` is
rewritten to `{ x=inner }` — no true process isolation without fork).

Scripts
-------

Three scripts in `bin/` automate the build process. All are idempotent.

```
bin/setup           # one-time initial setup (steps 2–5): ncurses stub, emconfigure,
                    # source patches, build-file patches, config.modules
bin/build           # rebuild and deploy (steps 5c–7): make prep, patch config.h,
                    # emmake make, copy to web/
bin/patch-config    # patch config.h only — run after any make prep wipes it
```

After downloading `zsh-5.9/` (step 1), the full workflow is just:

```
bin/setup
bin/build
```

`bin/build` accepts optional flags:

```
bin/build [--debug] [--out DIR] [--with-sed] [--with-awk] [--with-bc]

  --debug      Compile with -O0 -g instead of -Os, and link with
               -sASSERTIONS=1 -gsource-map. Produces a larger build with
               readable stack traces in browser devtools. Never ship this.
  --out DIR    Deploy zsh.js and zsh.wasm to DIR instead of web/
               (useful when building for an npm package or other output target)
  --with-sed   Compile OpenBSD sed into the wasm binary as a `sed` builtin.
               Requires sed-src/ in the project root (included in this repo).
  --with-awk   Compile one-true-awk (BWK awk) into the wasm binary as an `awk`
               builtin. Requires awk-src/ in the project root (included in
               this repo).
  --with-bc    Compile Gavin Howard bc into the wasm binary as a `bc` builtin.
               Requires bc-src/ in the project root (included in this repo).
               bc <<< 'scale=4; 22/7' and heredoc input work; pipes to bc do not
               (pipes require fork). dc is also available.
```

JS modules
----------

`zsh.js` and `zsh.wasm` are the compiled wasm artifacts. Two JS modules support them:

- **`zsh-worker.js`** — Web Worker entry point. Loaded by `zsh-runtime.js`; imports
  `zsh.js` via `importScripts`, runs the wasm off the main thread, posts back results.
- **`zsh-runtime.js`** — core runner, no DOM dependencies. Exports `runZshScript(src)`
  which spawns a worker and returns `Promise<{ stdout, stderr }>`. Also exports
  `ansiToHtml`, `BUILTINS_PREAMBLE`, `ZSH_FS`, and `IDBFS_MOUNT`.
- **`zsh-loader.js`** — DOM layer. Imports from `zsh-runtime.js`, adds CodeMirror
  editors, Run/Copy buttons, and handles `<script type="text/zsh">` auto-run tags.
  When a script tag has a `data-stdin` attribute the loader inserts an editable
  Stdin textarea pane between Script and Output.

Using in HTML
-------------

```html
<!-- load the helper that runs <script type="text/zsh"> tags -->
<!-- zsh.js and zsh.wasm are loaded automatically inside a Web Worker -->
<script src="./zsh-loader.js" type="module"></script>

<!-- inline zsh script — output goes to #zsh-output -->
<pre id="zsh-output"></pre>
<script type="text/zsh" data-stdout="#zsh-output">
echo "Hello from zsh $ZSH_VERSION"
fruits=(apple banana cherry)
for f in $fruits; echo "  $f"
</script>

<!-- script with editable stdin — loader creates a Stdin pane automatically -->
<pre id="out-stdin"></pre>
<script type="text/zsh" data-stdout="#out-stdin" data-stdin="hello\nworld">
while IFS= read -r line; do echo "> $line"; done
</script>
```

Or call `runZshScript(src, { stdin })` directly from JavaScript:

```js
import { runZshScript } from './zsh-runtime.js';

const { stdout, stderr } = await runZshScript('cat', { stdin: 'hello world' });
```

The `stdin` option is a plain string. Pass `null` (or omit it) for no input.

### Filesystem backend

By default the loader uses an in-memory filesystem (MEMFS) that resets on each
run. To opt into IndexedDB-backed persistence (IDBFS), set `ZshWasmConfig`
before loading the loader:

```html
<script>
  var ZshWasmConfig = { fs: 'idbfs' };
</script>
<script src="./zsh-loader.js" type="module"></script>
```

With IDBFS, files written under `/home/user` persist across page reloads and
are shared between all script blocks on the page (each run syncs in from IndexedDB
before executing and syncs out after).

### Built-in shims

WebAssembly cannot `fork`, so external binaries (`touch`, `cat`, `ls`, etc.) fail
with "function not implemented". The loader prepends zsh function shims for the
most common ones:

| Command  | Flags supported      | Notes |
|----------|----------------------|-------|
| `ls`     | `-a`/`-A` `-l` `-R`  | `-l` shows real mode/size/mtime via `zstat`; `-a` includes dotfiles; `-R` recurses |
| `touch`  | —                    | creates or updates files |
| `cat`    | —                    | reads files via `$(<file)` substitution |
| `cp`     | —                    | single-file copy |
| `mv`     | —                    | single-file move (uses `zf_rm` from `zsh/files`) |
| `wc`     | `-l` `-w` `-c`       | lines, words, bytes; default shows all three |
| `head`   | `-n N`, `-N`         | first N lines (default 10) |
| `tail`   | `-n N`, `-N`         | last N lines (default 10) |
| `grep`   | `-i` `-v` `-n` `-c` `-r`/`-R` `-l` `-o` `-e PAT` `-m N` `-A`/`-B`/`-C N` `-H`/`-h` | POSIX ERE via `=~`; powered by `zsh/regex` module (musl libc); multi-file output includes `filename:` prefix |
| `sort`   | `-r` `-n` `-u` `-k N` | in-memory sort via zsh array flags `(o)`/`(O)`/`(on)`; `-k N` sorts by Nth field |
| `uniq`   | —                    | removes consecutive duplicate lines |
| `cut`    | `-d DELIM` `-f RANGE` `-c N[-M]` | field ranges (`1-3`, `2,4`); `-c` for character positions |
| `tr`      | `-d`                 | reads from stdin (`< file`); `a-z`/`A-Z` ranges use `${(U)}`/`${(L)}` |
| `date`    | `+FORMAT`            | uses `strftime` from `zsh/datetime`; no timezone (outputs UTC) |
| `basename`| suffix arg           | strips directory and optional suffix (`basename /a/b.txt .txt` → `b`) |
| `dirname` | —                    | strips last component (`dirname /a/b` → `/a`; `dirname foo` → `.`) |
| `rm`      | `-f` `-r`/`-rf`      | delegates to `zf_rm`/`zf_rmdir` from `zsh/files`; `-r` removes directory trees |
| `tee`     | `-a`                 | reads all stdin, writes to file(s) and stdout; use with `< file` or `<<< str`, not pipes |
| `seq`     | `N`, `start N`, `start step N` | integer sequence; `seq 0 2 10` → `0 2 4 6 8 10` |
| `mktemp`  | `-d`, template       | creates temp file or dir; replaces trailing `X`'s with random digits |
| `sleep`   | —                    | no-op in wasm (synchronous environment); prevents "command not found" |
| `find`    | `-name`, `-type f/d/l`, `-maxdepth`, `-newer` | zsh glob recursion; dotfiles included; `-exec` not supported |
| `xargs`   | `-I STR`, `-n N`     | reads stdin; default collects all items into one call; `-I` replaces per-line; `-n` batches |
| `env`     | `VAR=val`, `-u VAR`  | prints environment or runs command with modified env; `-i` (clear env) silently ignored |
| `printenv`| `[VAR ...]`          | prints value of named variables, or all exported variables |

`mkdir` works natively — Emscripten supports that syscall directly without forking.

When built with `--with-sed`, `--with-awk`, and/or `--with-bc`, compiled-in builtins are also available:

| Command | Flag      | Source    | Notes |
|---------|-----------|-----------|-------|
| `sed`   | `--with-sed` | OpenBSD sed | Full sed: `s/pat/repl/[g]`, `/pat/d`, `-n`, `-e`, address ranges, hold space. Use file args; stdin via `<<< text` works. |
| `awk`   | `--with-awk` | one-true-awk (BWK) | Full awk: patterns, BEGIN/END, field splitting (`-F`), variables (`-v`), gsub/sub/split, printf. File args or `awk 'prog' <<< data` work; pipes require fork and don't work. |
| `bc`    | `--with-bc`  | Gavin Howard bc (MIT) | Arbitrary-precision math: `scale`, `sqrt()`, user-defined functions. Use `bc <<< 'expr'` or heredoc; `echo expr \| bc` requires fork. `dc` is also available. |

Known Limitations
-----------------

- **No job control** — `sigsuspend`, `prlimit`, `getrusage` syscalls are stubs or
  unsupported; you'll see harmless warnings in the console.
- **No fork** — external binaries that aren't shimmed above will fail. Use the
  provided shims or zsh builtins instead.
- **No ZLE** — the interactive line editor and completion system are excluded from
  the build (they require a real terminal and add ~350KB to the binary).
- **`$(...)` command substitution is in-process** — zsh-wasm patches `getoutput()`
  to run the substituted command in the current process rather than a fork. Two
  consequences: (1) variable assignments inside `$(...)` leak to the parent shell
  (no subshell isolation); (2) output larger than the OS pipe buffer (~64 KB) would
  deadlock. For typical scripting workloads neither limit matters. `$(< file)` is
  handled by a separate fast path and has no such restrictions.
- **Subshell `(...)` variable isolation** — `(cmd)` subshells are rewritten by
  `simulatePipes()` to `{ cmd }` group commands so they execute, but variable
  mutations inside leak into the parent scope. `x=outer; (x=inner); echo $x`
  prints `inner` not `outer`. True isolation requires `fork()`, which is not
  available in wasm.
- **`tr` reads only from stdin** — use `tr args < file`; pipes require fork and don't work.
- **`sed` (--with-sed build) reads only from file args** — C-level stdin reads in zsh builtins bypass the wasm pipe simulation; use `sed 's/x/y/' file` not `echo x | sed 's/x/y/'`.
- **`awk` (--with-awk build) reads only from file args** — same constraint as sed; use `awk 'prog' file` or `awk 'prog' <<< "data"` not `echo data | awk 'prog'`.
- **`date` has no timezone** — outputs UTC regardless of system locale.
- **stdin is always newline-terminated** — if the string passed as `stdin` does
  not end with `\n`, one is appended before feeding it to the wasm process. This
  is the correct POSIX convention for text and is transparent to line-oriented
  tools (`while read`, `wc -l`, etc.). It adds one spurious byte for
  byte-counting operations (`wc -c < /dev/stdin`).

License
-------

[The Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE).
