Roadmap
=======

Status labels:
- **planned** — committed, will be done
- **possible** — interesting, not yet committed

---

## Planned

### Web Worker execution

Move wasm execution into a [Web Worker](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) so scripts run off the main thread.

Benefits:
- UI stays responsive while zsh runs (no frozen tab)
- Enables a "Stop" button to terminate runaway scripts
- Required foundation for the interactive shell (see Possible below)

This is a loader (`zsh-loader.js`) change only — zero impact on wasm binary size.

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

### stdin support

Allow scripts to receive standard input. The loader writes to a pre-populated
file before `callMain`, and the script reads from it (or from a virtual pipe).
Loader change only — no wasm binary change.

---

### Automated tests (Playwright) ✓ done

`web/test.html` runs 22 test cases and compares actual vs. expected output:
- Open manually in a browser (via HTTP server)
- Run automatically via [Playwright](https://playwright.dev/): `npx playwright test`

Covers: shell builtins, all shims (touch, cat, cp, mv, wc, head, tail, grep, ls),
glob patterns, recursive globs, and module loading (`zsh/datetime`).

---

### npm package

Publish `zsh.js`, `zsh.wasm`, and `zsh-loader.js` as an npm package with a
clean JS API, so anyone can embed a zsh interpreter in their web project with
a single `npm install`.

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
