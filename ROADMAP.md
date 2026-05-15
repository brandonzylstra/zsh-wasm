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

### Additional shims: sort, uniq, cut, tr, date ✓ done

Implemented as pure zsh functions in `BUILTINS_PREAMBLE`. No Web Workers needed.

| Shim   | Approach |
|--------|----------|
| `date` | `strftime` from `zsh/datetime`; `+FORMAT` arg supported |
| `sort` | `${(o)}` / `${(O)}` / `${(on)}` array flags for alpha/reverse/numeric sort |
| `uniq` | consecutive-duplicate removal with loop |
| `cut`  | `\x01` as internal separator; field ranges (`1-3`, `2,4`) supported |
| `tr`   | `${(U)}`/`${(L)}` for `a-z`↔`A-Z`; char-by-char loop for arbitrary mappings |

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

`web/test.html` runs 70 test cases and compares actual vs. expected output:
- Open manually in a browser (via HTTP server)
- Run automatically via [Playwright](https://playwright.dev/): `npx playwright test`

Covers: shell builtins (echo, printf, if, for, while, case, function), all shims
(touch, cat, cp, mv, wc, head, tail, grep, ls, sort, uniq, cut, tr, date), glob
patterns, recursive globs, module loading (`zsh/datetime`), stdin, exit codes,
POSIX regex (`=~`, grep anchors, alternation, character classes, `+`, `?`, `{n}`
quantifiers), grep across multiple files, sort combined flags (`-rn`), cut
open-ended field ranges (`-f3-`, `-f-2`), wc across multiple files, and sed
(substitution, global replace, deletion, `-n`/`-e`, address ranges).

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

### awk

**Zsh shim** covers `awk '{print $N}'`, `-F sep`, `NR`/`NF`, simple
`BEGIN`/`END` — but anything with user-defined functions, arrays, or complex
pattern-action pairs requires near-complete reimplementation. Shim ceiling is
low.

**Compiled wasm** is the better long-term answer. mawk is ~5 KLOC of portable
C, compiles cleanly, and produces a ~250 KB wasm module. Same JS interception
architecture as sed above. Deferred until the multi-module wasm loading
pattern is established (likely alongside or after sed).
