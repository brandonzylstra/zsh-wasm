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
