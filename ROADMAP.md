Roadmap
=======

Status labels:
- **planned** — committed, will be done
- **possible** — interesting, not yet committed

---

## Planned

### Web Worker execution ✓ done

Wasm runs in a dedicated Web Worker (`zsh-worker.js`). `zsh-runtime.js` spawns a
fresh worker per script run, posts the script, and awaits the `{ stdout, stderr }`
reply. The main thread never blocks.

Benefits achieved:
- UI stays responsive while zsh runs
- Worker is naturally terminated on completion (no leaked instances)
- Foundation for a future Stop button (`worker.terminate()`)

Zero impact on wasm binary size — loader change only.

---

### Additional shims: sort, uniq, cut, tr, date, basename, dirname, rm, tee, seq, mktemp, sleep ✓ done

Implemented as pure zsh functions in `BUILTINS_PREAMBLE`. No Web Workers needed.

| Shim       | Approach |
|------------|----------|
| `date`     | `strftime` from `zsh/datetime`; `+FORMAT` arg supported |
| `sort`     | `${(o)}` / `${(O)}` / `${(on)}` array flags; `-k N` field sort via tab-prefixed schwartzian transform |
| `uniq`     | consecutive-duplicate removal with loop |
| `cut`      | `-f` field ranges with `\x01` separator; `-c` character positions via `${line[s,e]}` |
| `tr`       | `${(U)}`/`${(L)}` for `a-z`↔`A-Z`; char-by-char loop for arbitrary mappings |
| `basename` | parameter expansion (`##*/`, `%suffix`) |
| `dirname`  | parameter expansion (`%/*`), handles root and relative paths |
| `rm`       | delegates to `zf_rm`/`zf_rmdir` (from `zsh/files`); supports `-f`, `-r`, `-rf` |
| `tee`      | drains stdin with `read -d ''`; writes to file(s) and stdout; supports `-a` |
| `seq`      | arithmetic for-loop; 1, 2, or 3 arg forms |
| `mktemp`   | counts trailing X's, generates random digits, calls `touch`/`mkdir -p` |
| `sleep`    | no-op (wasm is synchronous; prevents "command not found" errors) |

---

### stdin support ✓ done

Scripts receive standard input via the Emscripten `Module.stdin` callback,
fed byte-by-byte from a string passed through postMessage. The API is:

```js
runZshScript(src, { stdin: 'hello\nworld' })
```

The demo page shows an editable Stdin pane (3-column layout) when a script
tag carries `data-stdin`. No wasm binary change — runtime/loader only.

---

### Automated tests (Playwright) ✓ done

`web/test.html` runs 235 test cases (233 passing, 2 `knownFail`) and compares actual vs. expected output:
- Open manually in a browser (via HTTP server)
- Run automatically via [Playwright](https://playwright.dev/): `npx playwright test`

Covers: shell builtins (echo, printf, if, for, while, case, function), all shims
(touch, cat, cp, mv, wc, head, tail, grep, ls, sort, uniq, cut, tr, date,
basename, dirname, rm, tee, seq, mktemp, sleep), stdin for grep/cat/wc,
glob patterns, recursive globs, module loading (`zsh/datetime`, `zsh/mathfunc`),
stdin, exit codes, POSIX regex (`=~`, capture groups via `$match`, grep anchors,
alternation, character classes, `+`, `?`, `{n}` quantifiers), grep across
multiple files and with `-A`/`-B`/`-C` context, sort `-rn`/`-k`, cut field ranges and character positions, wc
across multiple files, sed (substitution, global, deletion, `-n`/`-e`, address
ranges, in-place editing, back-references), awk (field splitting, `-F`,
`NR`/`NF`/`FNR`, arrays, user-defined functions, `substr`/`split`, `sub`/`gsub`,
`length`, `printf`, user variables), here strings (`<<<`), heredocs, `read -A`,
`typeset -i`, arithmetic (modulo, negative), `file-test` operators
(`-f`/`-d`/`-e`/`-s`), parameter join with custom separator, string/parameter
operations, pipe simulation (`a | b | c` rewritten to temp-file chaining),
subshell simulation (`(cmd)` rewritten to `{ cmd }` at top level),
`fork: 'off'` no-pipe path, `createPool`/`shutdownDefaultPool` (including
parallel execution via `createPool(2)`), extended grep (`-r -l -o -e -m`),
`head -c`/`tail -c` byte-count mode, `which`, `realpath`, `ln`, and `base64`/`base64 -d`.

Known limitations (2 `knownFail`): (1) subshell variable mutations leak into the
outer scope because `(cmd)` is rewritten to `{ cmd }` — no true process
isolation without fork. `x=outer; (x=inner); echo $x` prints `inner` not `outer`.
(2) Hard links (`ln src dst`) are not supported in Emscripten MEMFS.

The runner supports a `knownFail` flag on individual tests: these display on
the page as grey `xfail` entries with expected/actual detail, are excluded from
the Playwright failure count, and serve as a live record of known broken
behaviour pending a fix.

---

### npm package ✓ done

`npm/package.json` defines the `zsh-wasm` package. After building:

```
bin/build --out npm/
cd npm && npm publish
```

Entry point is `zsh-runtime.js`, which exports `runZshScript(src, { stdin, fs })`.
The package ships four files: `zsh-runtime.js`, `zsh-worker.js`, `zsh.js`, `zsh.wasm`.

---

## Known issues / investigations

### `=~` (POSIX regex) ✓ done

**Root cause (resolved)**

`zsh/regex` was compiled out. Its `.mdd` only emits `link=dynamic` or `link=no`;
since we build with `--disable-dynamic`, configure chose `link=no`. At runtime,
`[[ str =~ pat ]]` calls `ensurefeature("zsh/regex")` in `Src/cond.c`, which
fails because the module is absent, then calls `zerrnam()` and sets `errflag`.
`errflag` causes zsh to abort the script immediately — before any `|| echo no`
branch can run — producing empty stdout. musl's `regcomp`/`regexec` were never
reached at all; `HAVE_REGCOMP` and `HAVE_REGEXEC` are both `1` in `config.h`.

**Fix**

`bin/build` patches `config.modules` after every `make prep` to force
`zsh/regex link=static load=yes`, exactly like `zsh/files` and `zsh/stat`.
(The patch must live in `bin/build`, not just `bin/setup`, because `make prep`
re-runs `config.status` which regenerates `config.modules` from the `.mdd` files,
resetting any earlier patch.) Size impact: ~24 KB added to wasm binary.

---

## Possible

### Interactive shell

A real interactive zsh session in the browser: type commands, get output,
use arrow keys for history. Requires:

- **Web Worker** (planned above) for non-blocking I/O
- **xterm.js** for VT100 terminal rendering
- Either re-enabling ZLE (~350KB binary increase) or implementing a JS-side
  readline that feeds input to zsh's non-interactive script mode

Large undertaking with uncertain payoff — useful for a playground or tutorial
site, but not needed for the primary use case of running scripted examples.

---

### sed ✓ done

OpenBSD sed is compiled into the wasm binary as a zsh builtin via `bin/build --with-sed`.
The default build stays slim (~892 KB); `--with-sed` adds ~24 KB.

Implementation approach:
- OpenBSD sed source (~2 KLOC C) patched for embedding: `exit()` replaced by
  `longjmp`-based `sed_do_exit()`, `err()`/`errx()` replaced by wrappers,
  `pledge()` stubbed, all global state reset between calls
- Zsh module glue (`zsh-5.9/Src/Modules/sed.c`) registers `sed` as a builtin
- `sed-src/` holds the patched sed source and embedding glue
- `bin/build --with-sed` compiles the sed objects separately and injects them
  at link time via `LDFLAGS`

User-controlled: the `--with-sed` flag is passed at build time, keeping the
default wasm lean while allowing users to opt in. Future tools (awk, bc) can
use the same optional-builtin pattern.

---

### awk ✓ done

One-true-awk (BWK awk, Lucent license) compiled into the wasm binary as a zsh
builtin via `bin/build --with-awk`. Supports user-defined functions, arrays,
`sub`/`gsub`, `printf`, `NR`/`NF`/`FNR`, multiple input files, `-F sep`, `-v`.

Same embedding pattern as sed: `exit()` replaced by `longjmp`-based wrapper,
all global state reset between calls, registered as a zsh builtin in
`awk-src/awk_mod.c`.

---

### bc ✓ done

Gavin Howard's bc (BSD-2-Clause, v7.0.3) compiled into the wasm binary as a zsh
builtin via `bin/build --with-bc`. Supports arbitrary-precision arithmetic, `scale`,
`sqrt()`, user-defined functions, and dc mode. History and NLS disabled for wasm.

Embedding approach (same pattern as sed/awk):
- `bc-src/` holds the bc source with two modifications: `main()` renamed to
  `bc_embed_main()`, and the 5 `exit()` calls in `vm.c`/`file.c` replaced by
  `bc_do_exit()` which longjmps to the module wrapper's setjmp.
- bc requires a code generation step: `gen/strgen.c` (compiled natively) converts
  `gen/bc_help.txt`, `gen/dc_help.txt`, and `gen/lib.bc` to C source arrays.
  `bin/build --with-bc` runs this automatically with a local `build-bc/strgen`.
- Build flags: `BC_ENABLED=1 DC_ENABLED=1 BC_ENABLE_HISTORY=0 BC_ENABLE_EXTRA_MATH=0
  BC_ENABLE_NLS=0 BC_ENABLE_OSSFUZZ=0`

Known limitation: `echo expr | bc` requires a pipe (fork). Use `bc <<< 'expr'` or
a heredoc instead — both work because they use temp files rather than fork.

Source: `bc-7.0.3/` (downloaded from GitHub); `bc-src/` holds the patched copy.

---

## Planned

### Shim architecture decision

`BUILTINS_PREAMBLE` is exported as a string constant — it is prepended to every
script by `runZshScript()` automatically. Users who construct scripts that
already define their own `basename`, `rm`, etc. may want to skip the preamble or
override individual shims. Options to decide:

- **Status quo**: always prepend preamble (current behavior; simple)
- **Opt-out**: `runZshScript(src, { preamble: false })`
- **Selective override**: export preamble as a mutable dict, let users delete keys

Decision deferred until someone reports a concrete conflict.

---

### Remaining shim gaps

Common Unix utilities not yet shimmed. The bar is: used frequently enough in
real scripts, and implementable without forking.

Candidates:
- `printf` (already a zsh builtin — no shim needed)
- `find` ✓ done — zsh glob recursion
- `xargs` ✓ done — default, `-I STR`, `-n N`
- `tee` ✓ done

---

### TypeScript types (planned, pre-npm-publish)

`npm/index.d.ts` already declares the public API. Needs review:
- Is `RunOptions.fs` well-documented enough?
- Should `BUILTINS_PREAMBLE` type be `string` or a structured type?
- Add JSDoc comments to the `.d.ts` before publishing.

---

### npm publish prerequisites ✓ done

1. TypeScript types reviewed and documented ✓
2. Shim table complete: all shimmed utilities listed with correct flag columns;
   env/printenv added; grep `-A`/`-B`/`-C`, sort `-k N`, cut `-c` documented ✓
3. README has quick-start example and Known Limitations (incl. subshell isolation) ✓
4. **Version policy**: `0.x` until `1.0`. No stability guarantee on the API before
   `1.0`. Breaking changes get a minor-version bump (e.g. `0.2.0`). ✓
5. **Wasm delivery**: bundle as npm asset (current). `.wasm` is ~900 KB
   uncompressed / ~300 KB gzip'd. CDN and user-supplied-path options deferred
   until there is user demand. ✓

---

## Open questions / possible

### Wasm delivery strategy ✓ decided

**Decision**: bundle as npm asset. `.wasm` ships inside the package (~900 KB
uncompressed, ~300 KB gzip'd). CDN and user-supplied-path options deferred until
there is user demand — they would require an API change and are not needed for
the primary use case.

---

### Node.js support — hypothetically possible, mostly closed

Currently targets browsers only (Web Workers, `import.meta.url`). Node.js would
require replacing `Worker` with `worker_threads` and resolving `import.meta.url`
path differences. Feasibility is high, but no concrete use case has been
identified that isn't better served by Docker or a native shell subprocess.
Not on the roadmap unless a real use case emerges.

---

### Worker pooling ✓ done

`runZshScript()` now uses a lazy default pool of size 1. Each worker
pre-initializes a fresh wasm module immediately after completing a run,
so the next call finds a warm module ready — overlapping init with the
caller's processing time. State isolation is guaranteed: each run gets
a fully fresh module instance.

New exports: `createPool(size?)` for dedicated pools, `shutdownDefaultPool()`
for cleanup. The pool size defaults to 1 (right for sequential use); pass
a larger size to `createPool()` for parallel workloads.

Observed speedup in the Playwright test suite: ~18–28 s → ~3–4 s for
193 sequential tests (warm pool hit on every test after the first).

---
