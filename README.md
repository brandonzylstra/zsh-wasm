Zsh Wasm
========

Compile the Z Shell for WebAssembly using Emscripten, so it can run inside a browser.

Demo
----

Open `web/index.html` (served via an HTTP server — see below) to see zsh running in the browser.

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

#### 5b. Enable zsh/files and zsh/stat

`zsh/files` provides file-operation builtins (`zf_mkdir`, `zf_rm`, etc.) that work
without forking. `zsh/stat` provides `zstat` for reading file metadata.

```
sed -i '' -E \
  -e 's/^(name=zsh\/(files|stat) .*)link=no/\1link=static/' \
  -e 's/^(name=zsh\/(files|stat) .*)load=no/\1load=yes/' \
  config.modules
```

#### 5c. Regenerate Makefiles

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

JS modules
----------

`zsh.js` and `zsh.wasm` are the compiled wasm artifacts. Two JS modules support them:

- **`zsh-runtime.js`** — core runner, no DOM dependencies. Exports `runZshScript(src)`
  which returns `{ stdout, stderr }` as strings. Also exports `ansiToHtml`,
  `BUILTINS_PREAMBLE`, and the `ZSH_FS` / `IDBFS_MOUNT` constants.
- **`zsh-loader.js`** — DOM layer. Imports from `zsh-runtime.js`, adds CodeMirror
  editors, Run/Copy buttons, and handles `<script type="text/zsh">` auto-run tags.

Using in HTML
-------------

```html
<!-- load the wasm module -->
<script src="./zsh.js"></script>
<!-- load the helper that runs <script type="text/zsh"> tags -->
<script src="./zsh-loader.js" type="module"></script>

<!-- inline zsh script — output goes to #zsh-output -->
<pre id="zsh-output"></pre>
<script type="text/zsh" data-stdout="#zsh-output">
echo "Hello from zsh $ZSH_VERSION"
fruits=(apple banana cherry)
for f in $fruits; echo "  $f"
</script>
```

Or call `runZshScript(src, stdoutSelector, stderrSelector)` directly from JavaScript.

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
| `wc`     | —                    | line count only |
| `head`   | `-n N`, `-N`         | first N lines (default 10) |
| `tail`   | `-n N`, `-N`         | last N lines (default 10) |
| `grep`   | —                    | POSIX regex via zsh `=~`; no flags |
| `sort`   | `-r` `-n` `-u`       | in-memory sort via zsh array flags `(o)`/`(O)`/`(on)` |
| `uniq`   | —                    | removes consecutive duplicate lines |
| `cut`    | `-d DELIM` `-f N`    | field ranges (`1-3`, `2,4`) supported |
| `tr`     | `-d`                 | reads from stdin (`< file`); `a-z`/`A-Z` ranges use `${(U)}`/`${(L)}` |
| `date`   | `+FORMAT`            | uses `strftime` from `zsh/datetime`; no timezone (outputs UTC) |

`mkdir` and `rm` work natively — Emscripten supports those syscalls directly without forking.

Known Limitations
-----------------

- **No job control** — `sigsuspend`, `prlimit`, `getrusage` syscalls are stubs or
  unsupported; you'll see harmless warnings in the console.
- **No fork** — external binaries that aren't shimmed above will fail. Use the
  provided shims or zsh builtins instead.
- **No ZLE** — the interactive line editor and completion system are excluded from
  the build (they require a real terminal and add ~350KB to the binary).
- **`wc` counts lines only** — no word or byte count.
- **`grep` has no flags** — no `-i`, `-v`, `-n`, etc.
- **`tr` reads only from stdin** — use `tr args < file`; pipes require fork and don't work.
- **`date` has no timezone** — outputs UTC regardless of system locale.

License
-------

[The Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE).
