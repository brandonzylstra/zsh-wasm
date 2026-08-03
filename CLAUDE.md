zsh-wasm — Project Context
==========================

What This Is
------------

Zsh 5.9 compiled to WebAssembly via Emscripten. Runs a real, fully-functional
zsh interpreter inside a browser tab, with no server required. Primary use case:
executing zsh script examples in the [CodeCompared](https://github.com/brandonzylstra/CodeCompared)
interactive cheatsheet site (https://codecompared.to, with per-language subdomains
like https://ruby.codecompared.to).

Published as `@brandon.zylstra/zsh-wasm` on npm; target unscoped name `zsh-wasm`
once the npm account has sufficient history.

---

Owner Preferences
-----------------

- No abbreviated variable names. `arr`, `lst`, `fn`, `str`, `buf`, `lang`, `cfg`
  are all unacceptable in new code. Use meaningful names.
- Commit when a logical task is complete. Simple messages, starting with one or
  two emoji that symbolize the content.
- All planning work lives in `docs/PLAN.md` (general roadmap) and `docs/NPM.md`
  (npm publish checklist). Update them when tasks complete or new work is identified.
- `docs/CODECOMPARED.md` documents the steps to make this package available as an
  offline-capable runtime in CodeCompared — update it when versions change.

---

Key Files
---------

| File                                 | Purpose                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `bin/build`                          | Main Emscripten build script; outputs `web/zsh.js` + `web/zsh.wasm`              |
| `bin/setup`                          | One-time setup; also holds the `Src/exec.c` patches that make `$( )` and pipelines work without `fork()` |
| `bin/run-script`                      | Node CLI harness: run a script against a build without a browser (dev aid)      |
| `embed/embed_stdin.h`                | Shared stdin reset used by the compiled sed/awk/bc builtins                     |
| `web/zsh.js`                         | Emscripten loader (build output, committed to git)                               |
| `web/zsh.wasm`                       | Compiled Zsh 5.9 binary (build output, committed)                                |
| `web/zsh-runtime.js`                 | JS wrapper: `runZshScript(src, opts)` → `{ stdout, stderr }`                     |
| `web/zsh-worker.js`                  | Web Worker that isolates WASM execution from the main thread                     |
| `web/zsh-loader.js`                  | Lazy-loader helper used by the CodeCompared runner                               |
| `web/index.html`                     | Interactive demo page                                                            |
| `web/test.html`                      | Playwright test harness (235 test cases)                                         |
| `npm/package.json`                   | npm package manifest for `@brandon.zylstra/zsh-wasm`                             |
| `npm/index.d.ts`                     | TypeScript type declarations                                                     |
| `docs/PLAN.md`                       | Roadmap: compiled builtins, pipe simulation, idbfs, etc.                         |
| `docs/NPM.md`                        | npm publish checklist                                                            |
| `docs/CODECOMPARED.md`               | Steps to release a version and update CodeCompared                               |
| `.github/workflows/deploy.yaml`      | Deploys `web/` to GitHub Pages on push to main                                   |
| `.github/workflows/publish-npm.yaml` | Publishes `npm/` to the npm registry on `v*` tag push (needs `NPM_TOKEN` secret) |

---

Architecture
------------

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

BUILTINS_PREAMBLE
-----------------

Because `fork()` is not available in WASM, external utilities are shimmed as
zsh functions that run inside the same WASM process. The preamble is prepended
to every script automatically. What remains in it after the sbase port is the
set where a zsh function beats a compiled tool — because it needs the shell's
own knowledge, or needs something `fork()`-less C cannot do: `cp`, `mv`, `rm`,
`ln`, `find`, `xargs`, `env`, `which`, `date`, `sleep`, `realpath`, `base64`,
plus the stubs for unavailable binaries.

Note `grep` is a compiled builtin as of 0.4.0 and is **BRE by default**, like
every real grep: `grep 'a|b'` looks for a literal pipe, `grep -E 'a|b'` is
alternation.

Editing the preamble: it is a JavaScript template literal, so a backtick or an
unescaped `${` inside it — including inside a zsh comment — ends the string and
breaks `zsh-runtime.js` at parse time. Quote shell snippets in comments with
'single quotes'. `bin/run-script --preamble` imports the module, so it fails
loudly on this; a Playwright run just hangs with zero tests completed.

`sed`, `awk`, `bc` and `diff` are compiled directly into the WASM binary (not
shims) via `bin/build --with-sed --with-awk --with-bc --with-diff`, and
seventeen sbase tools (`wc`,
`sort`, `cut`, `head`, `tail`, `uniq`, `tr`, `cat`, `tee`, `seq`, `touch`,
`mktemp`, `ls`, `basename`, `dirname`, `printenv`, `grep`) via `--with-sbase`. The published
package includes all of them, so the shipped build command is:

    bin/build --with-sed --with-awk --with-bc --with-sbase --with-diff

sbase sources are vendored in `sbase-src/`, OpenBSD diff in `diff-src/`; the
`PATCHES.md` in each lists every change made for embedding, and is what makes a
re-vendor tractable. `diff-src/LICENSE` is worth reading once: `diffreg.c` is
under Caldera's 4-clause BSD, which still has an advertising clause.

Because they are builtins rather than processes, every call in a script shares
one set of globals and one `stdin` FILE. Anything a tool leaves behind must be
reset per invocation — see `embed/embed_stdin.h` and the reset blocks at the top
of `awk_main()` / `bc_embed_main()` / `sed_main()`.

---

Building
--------

```zsh
# Prerequisites: Emscripten, zsh-5.9 source at ./zsh-5.9/
./bin/build                          # slim build
./bin/build --with-sed --with-awk --with-bc --with-sbase --with-diff   # what ships
./bin/build --out npm/               # build and copy to npm/ for publishing

# Test (requires HTTP server — file:// triggers CORS errors)
npx serve web/ &
npx playwright test
```

---

Versioning and Releases
-----------------------

See `docs/CODECOMPARED.md` for the full release-and-integration workflow.

Short version:
1. Bump `npm/package.json` `"version"` field
2. `bin/build --out npm/` to populate the npm package
3. Commit, tag (`git tag vX.Y.Z`), push tag — the tag push auto-publishes to
   npm via `.github/workflows/publish-npm.yaml` (requires the `NPM_TOKEN` secret)
4. Update three places in CodeCompared (headScripts URL, CACHE_GROUPS, LANGUAGE_RUNTIME_CACHES)

---

Known Limitations
-----------------

- **No `fork()`** — `Src/exec.c` is patched (see `bin/setup`) so that both `$( )`
  and pipeline stages run in the current shell instead of a child. Pipelines
  therefore work, but sequentially: each stage runs to completion, writing to a
  temp file the next stage reads. Nothing streams, and nothing is isolated —
  an assignment in a stage outlives it, and `exit` in a stage ends the script.
  `cmd &` runs `cmd` synchronously. Process substitution `<(cmd)` still fails.
- **No subshell isolation** — the body of `(cmd)` runs in this shell, so mutations
  inside a subshell leak to the outer scope.
- **Synchronous WASM** — no `sleep`, no real concurrency. `sleep` is a no-op shim.
- **MEMFS** — the virtual filesystem is in-memory and reset on each `runZshScript`
  call (unless `{ fs: 'idbfs' }` is used for IndexedDB persistence).
