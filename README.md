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
`zsh/regex` enables `[[ str =~ pat ]]`.

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

351 test cases pass (353 total; 2 `knownFail`, documenting subshell variable
isolation and MEMFS's lack of hard links). Coverage includes: shell builtins (echo, printf, if, for, while, case, function,
`local` scoping, `$?` exit-status capture), all shims, glob patterns, recursive
globs, stdin, exit codes, POSIX regex via `=~` (anchors, alternation, character
classes, `+`/`?`/`{n}` quantifiers), grep in both dialects (BRE `\|`, `\{n\}` and
backreferences; ERE `|`, `+`, `?`, `{n}` under `-E`), multi-file grep and wc, grep `-A`/`-B`/`-C` context lines, sort combined flags,
cut open-ended field ranges, sed (substitution, deletion, address ranges, `-n`/`-e`,
`-i ''` in-place, line-addressed print), awk (field splitting, pattern matching,
gsub, sub, NF, NR, FNR, FILENAME, `length()`, `printf`, BEGIN/END, `-v` variables,
`-F` separator, multi-file), `zsh/mathfunc` (sin, cos, sqrt, log, etc.),
basename/dirname path manipulation, rm/rmdir, tee, grep/cat/wc from stdin,
diff (default, unified and context formats, ed and RCS scripts, -q, -i, -w,
recursive directory compare, stdin, exit statuses),
seq, mktemp, sleep, find (`-name`/`-type`/`-maxdepth`/`-newer`), env/printenv, sort `-k` field sort, cut `-c` character positions, which, realpath, ln, base64/base64 -d, head/tail `-c` byte-count mode, string operations (length, slice, replace, strip-prefix/suffix,
`${var:-default}`, upper/lower case), brace expansion, array/associative-array
operations, file-test operators (`-f`/`-d`), append redirect, logical operators,
`$(...)` command substitution, `$(< file)` file substitution, `zf_rm`, `zstat`,
pipelines (`a | b | c`, `|&`, pipelines inside `$( )`, functions and `while read`
loops, repeated invocations of the compiled sed/awk/bc from a pipe), subshells,
`createPool`/parallel execution/`shutdownDefaultPool`, and per-test rerun buttons in the test UI.

Known limitation: subshell variable mutations leak into the outer scope — without
`fork()` the body of `( )` runs in this shell, so `(x=inner)` changes `x`.

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
          [--with-sbase] [--with-diff]

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
               `echo 'scale=4; 22/7' | bc`, here-strings and heredocs all
               work. dc is also available.
  --with-sbase Compile seventeen sbase tools (wc, sort, cut, head, tail, uniq,
               tr, cat, tee, seq, touch, mktemp, ls, basename, dirname,
               printenv, grep)
               into the wasm binary as builtins, replacing their zsh-function
               shims. Requires sbase-src/ (included in this repo).
               Set SBASE_TOOLS to build a subset.
  --with-diff  Compile OpenBSD diff into the wasm binary as a `diff` builtin
               (~30 KB increase). Requires diff-src/ in the project root
               (included in this repo).

The published build is:

  bin/build --with-sed --with-awk --with-bc --with-sbase --with-diff
```

What those flags cost, measured on 2026-08-03:

| Build                                          | `zsh.wasm` |
| ---------------------------------------------- | ---------- |
| `bin/build` with no flags                      | 926.7 KB   |
| the published build, everything compiled in    | 1376.9 KB  |
| **what the tools add**                         | **450.2 KB** |

Everything is in one binary on purpose. An example that prints
`sort: command not found` has failed; one that took 450 KB longer to arrive has
not — and the file is served from a versioned URL, so a consumer caches it once
per release rather than once per visit. `docs/PLAN.md` item 8 has the working
for that decision, including why Emscripten's dynamic linking was measured and
turned down.

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

### Pipelines

`a | b | c` works, including `|&`, pipelines inside `$( )`, functions and loops,
and pipelines feeding the compiled `sed`, `awk` and `bc`:

```zsh
echo 'scale=4; 22/7' | bc              # 3.1428
printf 'c\na\nb\n' | sort | head -2   # a b
seq 100 | awk '{ total += $1 } END { print total }'
```

This is real zsh pipeline parsing, not a rewrite of the source text: nothing
inspects the script for `|` characters, so case-pattern alternations (`py|python)`),
glob qualifiers (`*(.)`) and anonymous functions (`() { ... }`) are never mistaken
for pipelines.

How it works: a pipeline normally runs each stage in its own forked process.
Wasm has no `fork()`, so `Src/exec.c` is patched (by `bin/setup`) to run each
stage in the current shell instead, one after another, with a temp file carrying
each stage's output on to the next. A real pipe cannot be used for this, because
Emscripten's pipe reports `EAGAIN` rather than end-of-file once drained, so a
stage reading a finished pipe would never see EOF.

The consequences are listed under Known Limitations: no isolation between stages,
and no streaming.

### Commands

WebAssembly cannot `fork`, so external binaries fail with "function not
implemented". zsh-wasm supplies the common ones two ways.

#### Compiled in

Real implementations, compiled into `zsh.wasm` as zsh builtins. These behave
like the tools they are, because they *are* the tools — flags, exit codes,
error messages and all.

| Command | Source | Notes |
|---------|--------|-------|
| `sed`   | OpenBSD sed | `s/pat/repl/[g]`, `/pat/d`, `-n`, `-e`, address ranges, hold space |
| `awk`   | one-true-awk (BWK) | patterns, BEGIN/END, `-F`, `-v`, gsub/sub/split, printf |
| `bc`    | Gavin Howard bc | arbitrary precision, `scale`, `sqrt()`, user functions; `dc` too |
| `wc`    | sbase | `-l` `-w` `-c` `-m`; a `total` line for multiple files |
| `sort`  | sbase | `-b` `-C` `-c` `-d` `-f` `-i` `-k` `-m` `-n` `-o` `-r` `-t` `-u` |
| `cut`   | sbase | `-b` `-c` `-d` `-f` `-n` `-s` |
| `head`  | sbase | `-n N`, `-N`, `-c N`; `==> name <==` headers for multiple files |
| `tail`  | sbase | `-n N`, `-N`, `-n +N`, `-c N`; headers for multiple files |
| `uniq`  | sbase | `-c` `-d` `-u` `-f fields` `-s chars` |
| `tr`    | sbase | full set translation, `-c` `-C` `-d` `-s` |
| `cat`   | sbase | `-u`; multiple files |
| `tee`   | sbase | `-a` `-i` |
| `seq`   | sbase | `-f fmt` `-s sep` `-w`; integer and float steps |
| `touch` | sbase | `-a` `-c` `-m` `-d/-t/-T time` `-r file` |
| `mktemp`| sbase | `-d` `-q` `-t` `-u` `-p dir` |
| `ls`      | sbase | `-1 -A -a -c -d -F -f -H -h -i -L -l -n -p -q -R -r -U -u`; symlink targets, real file types |
| `basename` / `dirname` | sbase | suffix stripping; POSIX path rules |
| `printenv` | sbase | `[var ...]` |
| `diff`  | OpenBSD diff | default, `-c`/`-u` (with `-C`/`-U num`), `-e`, `-f`, `-n`, `-q`, `-D`; `-b -d -i -p -t -T -w` for how lines are compared; `-r -N -P -s -S -x -X` for directories; `-L label` |
| `grep`  | sbase | `-E -F -H -R -c -h -i -l -n -o -q -r -s -v -w -x` `-e PAT` `-f FILE` `-m N` `-A`/`-B`/`-C N`. **Patterns are BRE unless `-E`**, as in every real grep |

The sbase tools (suckless, MIT) are vendored in `sbase-src/` and OpenBSD diff in
`diff-src/`; every change made to either for embedding is listed in the
`PATCHES.md` beside it. Build them with `--with-sbase` and `--with-diff`; sed,
awk and bc have their own flags.

`diff -u` and `diff -c` stamp their headers with each file's modification time,
as real diff does. The virtual filesystem is built fresh on every run, so those
timestamps are always "now" — pass `-L old -L new` when the output has to be
stable.

#### zsh function shims

Prepended to every script by the loader. These are approximations, and the ones
still here are the cases where a zsh function is the *better* answer: they either
need the shell's own knowledge, or they need something a compiled tool cannot do
without `fork()`.

| Command  | Flags supported      | Notes |
|----------|----------------------|-------|
| `cp`     | —                    | single-file copy |
| `mv`     | —                    | single-file move (uses `zf_rm` from `zsh/files`) |
| `rm`      | `-f` `-r`/`-rf`     | delegates to `zf_rm`/`zf_rmdir` from `zsh/files`; `-r` removes directory trees |
| `ln`      | `-s`, `-f`          | symlinks via `zf_ln -s`; hard links are not supported in MEMFS |
| `find`    | `-name`, `-type f/d/l`, `-maxdepth`, `-newer` | zsh glob recursion; dotfiles included; `-exec` not supported |
| `xargs`   | `-I STR`, `-n N`    | runs the command in this shell — a compiled xargs would need `exec()` |
| `env`     | `VAR=val`, `-u VAR` | same reason as xargs; `-i` (clear env) silently ignored |
| `which`   | —                   | knows about shell functions and builtins, which a PATH search does not |
| `date`    | `+FORMAT`           | uses `strftime` from `zsh/datetime`; always uses the browser's local timezone (Emscripten's `localtime` delegates to JS `Date`); `%z` outputs the correct UTC offset |
| `sleep`   | seconds (float)     | real sleep via `Atomics.wait()` in the Web Worker when `SharedArrayBuffer` is available (requires COOP+COEP headers); prints a stderr diagnostic and continues otherwise |
| `realpath`| —                   | resolves absolute path using zsh's `:A` modifier; sbase has no realpath |
| `base64`  | `-d`/`--decode`     | encode stdin to Base64 (76-char line wrap); decode Base64 to bytes; sbase has no base64 |

`mkdir` works natively — Emscripten supports that syscall directly without forking.

Well-known unavailable commands (curl, git, python3, docker, …) emit a helpful
stderr message and exit 127 without aborting the script.

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
- **Pipeline stages are not isolated** — `a | b` works (see "Pipelines" above), but
  because every stage runs in this one shell, an assignment in a stage outlives it
  (`echo x | read value` leaves `value` set — useful, and the opposite of bash) and
  an `exit` in a stage ends the whole script rather than just that stage. Stages run
  one at a time, in order, so a pipeline never streams: each stage reads its input
  only after the previous one has finished writing all of it. `cmd | head -1` still
  runs `cmd` to completion.
- **Subshell `(...)` variable isolation** — the body of a `( )` subshell runs in this
  shell, so variable mutations inside leak into the parent scope.
  `x=outer; (x=inner); echo $x` prints `inner`, not `outer`. True isolation requires
  `fork()`, which is not available in wasm.
- **`tr` reads only from stdin** — use `tr args < file` or a pipe, not a file argument.
- **Hard links are not supported** — `ln src dst` fails with "too many links" (a MEMFS
  limitation). `ln -s` works.
- **`TZ` supports UTC offsets only** — `TZ=UTC`, `TZ=UTC±H`, `TZ=UTC±H:MM`, and `TZ=±HH:MM` work. Named timezones (`TZ=America/New_York`) are not supported (no tzdata); `date` falls back to browser local time with a stderr warning.
- **Background jobs run in the foreground** — `&` requires `fork()`, so `cmd &` runs
  `cmd` synchronously and the script continues once it finishes. Nothing actually
  runs concurrently, and `wait` has no job to wait for.
- **Process substitution is not supported** — `<(cmd)` and `>(cmd)` require `fork()` and will abort the script. Use a temp file or a here-string (`<<<`) instead.
- **`sleep` requires COOP+COEP headers for real blocking** — without `SharedArrayBuffer` (cross-origin isolation), `sleep` is a no-op and a stderr diagnostic is printed. The demo site is served with the required headers; set them on your own server to get real blocking.
- **stdin is always newline-terminated** — if the string passed as `stdin` does
  not end with `\n`, one is appended before feeding it to the wasm process. This
  is the correct POSIX convention for text and is transparent to line-oriented
  tools (`while read`, `wc -l`, etc.). It adds one spurious byte for
  byte-counting operations (`wc -c < /dev/stdin`).

License
-------

zsh-wasm itself is under [the Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE),
as is the interpreter it is built from. The tools compiled into the binary keep
their own:

| Component        | Source                              | License                                        |
| ---------------- | ----------------------------------- | ---------------------------------------------- |
| zsh 5.9          | zsh-users                           | Zsh License                                    |
| `sed`            | OpenBSD sed                         | 3-clause BSD                                   |
| `awk`            | one-true-awk (BWK)                  | MIT-style (Lucent)                             |
| `bc`, `dc`       | Gavin Howard bc                     | 2-clause BSD                                   |
| 17 coreutils     | sbase (suckless)                    | MIT — `sbase-src/LICENSE`                      |
| `diff`           | OpenBSD diff                        | mixed — `diff-src/LICENSE`                     |

One of those is worth a second look before you build a product on it:
`diff-src/diffreg.c` is under Caldera International's 4-clause BSD, whose
clause 3 requires that advertising material mentioning the software's features
carry an acknowledgement. It binds advertising, not the software or its
documentation, and it is the same term OpenBSD, FreeBSD and NetBSD have shipped
`diff` under for two decades — but it is a live clause, unlike Berkeley's, which
was rescinded in 1999. `diff-src/LICENSE` has the wording. Building without
`--with-diff` leaves it out entirely.
