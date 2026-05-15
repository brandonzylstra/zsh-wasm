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

`web/test.html` runs 22 test cases and compares actual vs. expected output:
- Open manually in a browser (via HTTP server)
- Run automatically via [Playwright](https://playwright.dev/): `npx playwright test`

Covers: shell builtins, all shims (touch, cat, cp, mv, wc, head, tail, grep, ls),
glob patterns, recursive globs, and module loading (`zsh/datetime`).

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

### `=~` (POSIX regex) crashes the wasm process

**Symptoms**

`[[ str =~ pattern ]]` kills the entire wasm module — the process emits no
further stdout, not even the `no` branch of `[[ … ]] && … || echo no`. This
is not a "returns false" failure; it is a hard abort before any output lands.

**Consequence**

- Our `grep` shim originally used `[[ $line =~ $pat ]]` and returned empty
  output for every call (the first regex test on the first line killed the run).
- `grep` is now rewritten to use `case $str in (*$pat*)` (glob matching), which
  works but diverges from real grep: `.` is literal, `+`/`|`/`()` don't work,
  anchors (`^`/`$`) are not supported, etc.
- Empirical probe tests (below) are kept out of the main test suite because
  they will always fail until this is resolved.

**Tests removed from suite** (in `web/test.html` git history, commit `d186dbe`):

```js
{ name: 'regex-basic',   script: '[[ hello =~ ell ]] && echo yes || echo no', expected: 'yes' },
{ name: 'regex-dot',     script: '[[ hello =~ h.llo ]] && echo yes || echo no', expected: 'yes' },
{ name: 'regex-no-match',script: '[[ hello =~ xyz ]] && echo yes || echo no', expected: 'no' },
```

**Theories**

1. **musl `regcomp`/`regexec` calls `abort()`** — emscripten bundles musl libc,
   whose POSIX regex implementation may call `abort()` or `__assert_fail()` on
   an unimplemented code path. In wasm that unwinds the entire module.

2. **Signal delivery** — POSIX regex can raise `SIGABRT`. Signals in wasm are
   emulated; an unhandled one terminates the module.

3. **zsh compiled without regex** — unlikely (zsh 5.9 uses `=~` by default and
   the configure step would warn), but possible if the emscripten toolchain
   silently stubbed out the regex symbols.

**How to investigate**

- Add a tiny C program that calls `regcomp("ell", 0, &r); regexec(...)` and
  compile it with emscripten to see if it crashes independently of zsh.
- Search the emscripten / musl issue trackers for `regcomp` + `abort`.
- Check `build-zsh/config.h` for `HAVE_PCRE_H`, `HAVE_REGCOMP`, etc.
- Run the removed probe tests against a future build after any fix.

**Possible fixes**

- **Patch musl regex in the build** — supply a working `regcomp`/`regexec`
  (e.g., from a standalone POSIX regex library compiled to wasm) and link it
  in place of musl's broken version.
- **Enable PCRE** — build libpcre2 for wasm and configure zsh with
  `--enable-pcre`. zsh's `=~` will use PCRE instead of POSIX ERE.
- **Stub out regex at the zsh layer** — patch zsh source to replace `=~`
  with a JS-backed implementation via emscripten's `EM_JS` / `EM_ASM`.
- **Ship a JS-side grep** — implement `grep` entirely in JavaScript (using
  the browser's native `RegExp`) and inject it as a pre-run script rather
  than a zsh function. This sidesteps the wasm regex issue entirely.

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

### sed shim

`sed` is ubiquitous but implementing it faithfully in zsh (address ranges,
multiple commands, in-place editing) is complex. A basic single-substitution
`s/pattern/replacement/` covering the common case may be feasible; full sed
compatibility is not.

Not blocked on Web Workers — complexity is the only obstacle.

---

### awk shim

`awk` field splitting and pattern-action rules could be approximated in zsh
for simple scripts, but anything beyond trivial `awk '{print $1}'` usage would
require a near-complete reimplementation. Low priority; most awk use cases can
be replaced with zsh parameter expansion.

Not blocked on Web Workers — complexity is the only obstacle.
