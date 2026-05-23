# zsh-wasm — Project Context

## What This Is

Zsh 5.9 compiled to WebAssembly via Emscripten. Runs a real, fully-functional
zsh interpreter inside a browser tab, with no server required. Primary use case:
executing zsh script examples in the [RubyCompared](https://github.com/brandonzylstra/RubyCompared)
interactive cheatsheet site.

Published as `@brandon.zylstra/zsh-wasm` on npm; target unscoped name `zsh-wasm`
once the npm account has sufficient history.

---

## Owner Preferences

- No abbreviated variable names. `arr`, `lst`, `fn`, `str`, `buf`, `lang`, `cfg`
  are all unacceptable in new code. Use meaningful names.
- Commit when a logical task is complete. Simple messages, starting with one or
  two emoji that symbolize the content.
- All planning work lives in `docs/PLAN.md` (general roadmap) and `docs/NPM.md`
  (npm publish checklist). Update them when tasks complete or new work is identified.
- `docs/RUBYCOMPARED.md` documents the steps to make this package available as an
  offline-capable runtime in RubyCompared — update it when versions change.

---

## Key Files

| File | Purpose |
|------|---------|
| `bin/build` | Main Emscripten build script; outputs `web/zsh.js` + `web/zsh.wasm` |
| `web/zsh.js` | Emscripten loader (build output, committed to git) |
| `web/zsh.wasm` | Compiled Zsh 5.9 binary (build output, committed) |
| `web/zsh-runtime.js` | JS wrapper: `runZshScript(src, opts)` → `{ stdout, stderr }` |
| `web/zsh-worker.js` | Web Worker that isolates WASM execution from the main thread |
| `web/zsh-loader.js` | Lazy-loader helper used by the RubyCompared runner |
| `web/index.html` | Interactive demo page |
| `web/test.html` | Playwright test harness (235 test cases) |
| `npm/package.json` | npm package manifest for `@brandon.zylstra/zsh-wasm` |
| `npm/index.d.ts` | TypeScript type declarations |
| `docs/PLAN.md` | Roadmap: compiled builtins, pipe simulation, idbfs, etc. |
| `docs/NPM.md` | npm publish checklist |
| `docs/RUBYCOMPARED.md` | Steps to release a version and update RubyCompared |
| `.github/workflows/deploy.yaml` | Deploys `web/` to GitHub Pages on push to main |

---

## Architecture

```
Main thread                 Web Worker
-----------                 ----------
runZshScript(src, opts)
  → new Worker(zsh-worker.js)
  → postMessage({ source, stdin, fs })
                            → Module loads zsh.wasm
                            → prepends BUILTINS_PREAMBLE
                            → runs script
                            → postMessage({ stdout, stderr })
  ← resolve({ stdout, stderr })
```

Each `runZshScript` call gets a fresh worker (or a warm pre-initialized worker
from the default pool of size 1). State isolation is guaranteed: every run starts
from a clean WASM module instance.

---

## BUILTINS_PREAMBLE

Because `fork()` is not available in WASM, external utilities are shimmed as
zsh functions that run inside the same WASM process. The preamble is prepended
to every script automatically. It provides: `touch`, `cat`, `ls`, `cp`, `mv`,
`wc`, `head`, `tail`, `grep`, `sort`, `uniq`, `cut`, `tr`, `date`, `basename`,
`dirname`, `rm`, `tee`, `seq`, `mktemp`, `sleep`, `xargs`, `which`, `realpath`,
`ln`, `base64`, and `find`.

`sed`, `awk`, and `bc` are compiled directly into the WASM binary (not shims)
via `bin/build --with-sed --with-awk --with-bc`. The published npm package
includes all three.

---

## Building

```zsh
# Prerequisites: Emscripten, zsh-5.9 source at ./zsh-5.9/
./bin/build                          # slim build
./bin/build --with-sed --with-awk    # with compiled builtins
./bin/build --out npm/               # build and copy to npm/ for publishing

# Test (requires HTTP server — file:// triggers CORS errors)
npx serve web/ &
npx playwright test
```

---

## Versioning and Releases

See `docs/RUBYCOMPARED.md` for the full release-and-integration workflow.

Short version:
1. Bump `npm/package.json` `"version"` field
2. `bin/build --out npm/` to populate the npm package
3. Commit, tag (`git tag vX.Y.Z`), push tag
4. Update three places in RubyCompared (headScripts URL, CACHE_GROUPS, LANGUAGE_RUNTIME_CACHES)

---

## Known Limitations

- **No `fork()`** — pipes between external processes don't work. Use temp files
  or here strings as workarounds. The `|` operator between two *shims* works only
  if both sides are pure zsh functions (no subshell needed).
- **No subshell isolation** — `(cmd)` is rewritten to `{ cmd }`, so mutations
  inside a subshell leak to the outer scope.
- **Synchronous WASM** — no `sleep`, no real concurrency. `sleep` is a no-op shim.
- **MEMFS** — the virtual filesystem is in-memory and reset on each `runZshScript`
  call (unless `{ fs: 'idbfs' }` is used for IndexedDB persistence).
