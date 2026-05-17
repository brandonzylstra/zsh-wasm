# npm Publish Checklist

This document tracks everything that must be done before publishing `zsh-wasm`
to the npm registry. Work through each item in order; later items depend on
earlier ones being settled.

---

## Quick Checklist

### Blockers (must be resolved before any publish)

- [ ] **LICENSE file** — add `LICENSE` to the repo root; fix `"license"` field in `npm/package.json`
- [ ] **Populate `npm/` with built files** — establish and document the publish workflow
- [ ] **`prepublishOnly` script** — prevent publishing stale or unbuilt files
- [ ] **`isRuntimeNoise` type gap** — add to `index.d.ts` or unexport it
- [ ] **`engines` field** — mark package as browser-only in `package.json`
- [ ] **Bundler smoke test** — confirm a Vite project can `npm install` and use the package end-to-end
- [ ] **Version bump** — advance from `0.1.0` to `0.2.0` before first publish

### Should do (high value, low effort)

- [ ] **Document `ZshWasmConfig` global** — or remove it in favour of the per-call `fs` option
- [ ] **Document wasm asset size** — users need to know what they're pulling in
- [ ] **Document Node.js non-support** — clear error message or `engines` guard
- [ ] **Document `BUILTINS_PREAMBLE`** — explain the preamble, how to skip it, and how to override individual shims

### Open decisions (settle before 1.0, ideally before first publish)

- [ ] **Preamble opt-out API** — should `runZshScript(src, { preamble: false })` be supported?
- [ ] **Wasm delivery** — confirmed bundle-as-npm-asset; document size implications

---

## Detail: Each Item

---

### LICENSE file

**Status:** missing from repo root.

The npm registry requires a `license` field. The current `"license": "Zsh"` in
`npm/package.json` is not a valid SPDX identifier and will produce a registry
warning. The project bundles three components with different licenses:

| Component | License |
|-----------|---------|
| Zsh 5.9 (`zsh-5.9/LICENCE`) | MIT-like (Zsh Development Group) |
| OpenBSD sed (`sed-src/`) | BSD-3-Clause |
| one-true-awk (`awk-20260426/LICENSE`) | Lucent Technologies (permissive, not OSI-named) |
| glue code (`web/`, `awk-src/`, `sed-src/*.c` wrappers) | choose a license (MIT recommended) |

**Action:**

1. Decide the license for the glue code (MIT is simplest and most compatible).
2. Create `LICENSE` at the repo root with the glue code license.
3. Create `npm/THIRD_PARTY_LICENSES` (or similar) listing the three bundled
   licenses verbatim — required for the Lucent license.
4. Change `npm/package.json` `"license"` to `"MIT"` (or whatever matches the
   glue code license).

---

### Populate `npm/` with built files

**Status:** `npm/` currently contains only `package.json` and `index.d.ts`.
The runtime files (`zsh-runtime.js`, `zsh-worker.js`, `zsh.js`, `zsh.wasm`)
must be built and copied there before publishing.

**How it works today:**

```sh
bin/build [--with-sed] [--with-awk] --out npm/
```

This runs the full wasm build and then copies four files into `npm/`:
- `zsh.js` (Emscripten loader)
- `zsh.wasm` (~900 KB uncompressed, ~290 KB gzipped)
- `zsh-runtime.js` (copied from `web/`)
- `zsh-worker.js` (copied from `web/`)

**Problems with the current workflow:**
- The build requires Emscripten and takes several minutes. You cannot build on
  a CI machine without it installed.
- If you edit `web/zsh-runtime.js` without rebuilding, the `npm/` files are stale.
- Nothing prevents `npm publish` from running on an empty or stale `npm/`.

**Action:**

1. Document the full publish workflow in this file (see "Publish Workflow"
   section at the bottom).
2. Add a `prepublishOnly` check (see next item).
3. Consider keeping pre-built artifacts in git under `npm/` so contributors
   without Emscripten can still publish patch releases (e.g., doc fixes).
   Trade-off: large binary in git history.

---

### `prepublishOnly` script

**Status:** `npm/package.json` has no `scripts` field.

Without a guard, `npm publish` from the `npm/` directory will happily publish
whatever is (or isn't) there.

**Action:** Add to `npm/package.json`:

```json
"scripts": {
  "prepublishOnly": "node -e \"const fs=require('fs'); ['zsh.js','zsh.wasm','zsh-runtime.js','zsh-worker.js'].forEach(f=>{ if(!fs.existsSync(f)) { console.error('MISSING: '+f+' — run bin/build --out npm/ first'); process.exit(1); } });\""
}
```

Or write a small `npm/check-built.js` script and call it from `prepublishOnly`.

---

### `isRuntimeNoise` type gap

**Status:** `zsh-runtime.js` exports `isRuntimeNoise` but `index.d.ts` does not
declare it. TypeScript users who import it get a type error.

```js
// zsh-runtime.js
export function isRuntimeNoise(txt) {
    return txt.startsWith('warning: unsupported syscall:') ||
           txt.startsWith('program exited (with status:');
}
```

This is useful — it lets callers filter Emscripten runtime noise from stderr.

**Action:** Add to `index.d.ts`:

```ts
/**
 * Returns true if the string is Emscripten runtime noise (unsupported syscall
 * warnings, exit status messages) that should typically be hidden from users.
 */
export function isRuntimeNoise(text: string): boolean;
```

---

### `engines` field

**Status:** `npm/package.json` has no `engines` field. The package uses
`new Worker(...)` and `import.meta.url`, which do not exist in Node.js.
A Node.js user who installs the package will get a cryptic runtime error.

**Action:** Add to `npm/package.json`:

```json
"engines": {
  "browser": "*"
}
```

And add to the README's npm section:

> **Note:** This package targets browsers only. It requires Web Workers and
> `import.meta.url`. Node.js is not supported (see ROADMAP for status).

---

### Bundler smoke test

**Status:** The package works when loaded from `web/index.html` directly, but
has never been tested as an installed npm package inside a real bundler project.

The key risk: Vite, Webpack 5, and esbuild all handle
`new Worker(new URL('./zsh-worker.js', import.meta.url))` differently. Vite
inlines workers by default in some modes; Webpack requires `new
Worker(new URL(...), { type: 'module' })`; esbuild needs a plugin.

Additionally, Emscripten's runtime resolves `zsh.wasm` relative to `zsh.js` at
runtime. If a bundler renames or moves the wasm file (common with content
hashing), the package breaks silently.

**Action:**

1. Create a minimal Vite test project in `smoke-test/` (not committed to the
   main repo, or committed as a dev dependency):
   ```sh
   cd smoke-test && npm install && npm run build && open dist/index.html
   ```
2. Verify that `runZshScript('echo hello')` works in the built output.
3. Document any required bundler configuration in the README (e.g., Vite's
   `assetsInclude: ['**/*.wasm']` or equivalent).
4. Note which bundlers are tested and which are untested.

---

### Version bump

**Status:** `npm/package.json` is at `0.1.0`. This was set before sed, awk, 13
shims, and 159 tests existed. Publishing `0.1.0` now would be misleading.

**Action:** Bump to `0.2.0` in `npm/package.json` before the first publish.

Version policy (confirmed):
- Package is `0.x` — no stability guarantee until `1.0`.
- Minor bumps (`0.x.0`) for new shims, features, or API additions.
- Patch bumps (`0.x.y`) for bug fixes and documentation only.
- Breaking API changes (removing or renaming exports) warrant a major bump even
  within `0.x` as a courtesy.

---

### Document `ZshWasmConfig` global

**Status:** `zsh-runtime.js` reads `globalThis.ZshWasmConfig?.fs` at module
load time to set the default filesystem backend. This is not documented in the
README's npm section or in `index.d.ts`.

**How it works:**

```js
// Set before importing zsh-runtime.js to change the default fs backend:
globalThis.ZshWasmConfig = { fs: 'idbfs' };
import { runZshScript } from 'zsh-wasm';

// Or override per-call (works regardless of ZshWasmConfig):
const result = await runZshScript(src, { fs: 'idbfs' });
```

The per-call `fs` option (passing it to `runZshScript`) works correctly and
overrides the module-level default. The global is an escape hatch for cases
where you can't pass options to every call.

**Action:**

Option A (recommended): Document both mechanisms in the README npm section and
in `index.d.ts` via a module-level comment. Add:

```ts
/**
 * Optional global configuration. Set BEFORE importing this module.
 * @example globalThis.ZshWasmConfig = { fs: 'idbfs' };
 */
declare global {
  var ZshWasmConfig: { fs?: 'memfs' | 'idbfs' } | undefined;
}
```

Option B: Remove `ZshWasmConfig` entirely; `fs: 'memfs'` is always the default
and callers pass `{ fs: 'idbfs' }` per-call. Simpler API, but slightly more
verbose for callers who always want IDBFS.

---

### Document wasm asset size

**Status:** Not mentioned in the npm section of the README.

The package ships a ~900 KB `.wasm` file (~290 KB gzipped). Users should know
this before installing. The default build excludes ZLE/completion; `--with-sed`
adds ~24 KB; `--with-awk` adds ~60 KB.

**Action:** Add a note to the README npm section:

> The package ships a ~900 KB wasm binary (~290 KB gzipped). The default build
> excludes interactive line editing and tab completion. sed and awk are compiled
> in by default in the published package.

Also decide: does the published package include sed and awk? Currently the
decision is build-time. For the npm package, we should pick a fixed set and
document it. Recommendation: publish `--with-sed --with-awk` since that's the
fully-featured build; the size difference (~1 MB total) is acceptable.

---

### Document Node.js non-support

**Status:** Not mentioned anywhere prominently.

**Action:** One sentence in the README npm section and in the `engines` field
(see above). Also consider adding a runtime check at the top of `zsh-worker.js`
that throws a clear error if loaded outside a browser context.

---

### Document `BUILTINS_PREAMBLE`

**Status:** `BUILTINS_PREAMBLE` is exported and declared in `index.d.ts` with a
brief comment, but there's no explanation of what it is, why someone would use
it, or how to work around it.

**Action:** Add to the README npm section:

```md
### Built-in shims

`runZshScript` automatically prepends `BUILTINS_PREAMBLE` to every script.
This defines zsh functions for common Unix utilities that can't be forked
in wasm (`touch`, `cat`, `ls`, `grep`, `sort`, `cut`, `tr`, `date`,
`basename`, `dirname`, `rm`, `tee`, `seq`, `mktemp`, `sleep`, and more).

If your script already defines one of these (or you want to use a different
implementation), you can prepend an override before the preamble:
```

```js
import { runZshScript, BUILTINS_PREAMBLE } from 'zsh-wasm';

// Override the grep shim while keeping everything else:
const customPreamble = BUILTINS_PREAMBLE + '\ngrep() { my_grep "$@" }\n';
// ... or construct your own script that sources customPreamble manually
```

---

### Preamble opt-out API

**Status:** Open decision (see ROADMAP — "Shim architecture decision").

Currently `BUILTINS_PREAMBLE` is always prepended. There is no way to skip it
without constructing the raw script yourself. The exported `BUILTINS_PREAMBLE`
string makes manual construction possible, but it's awkward.

**Options:**

```js
// Option A: boolean flag
runZshScript(src, { preamble: false })

// Option B: string override
runZshScript(src, { preamble: myCustomPreamble })

// Option C: status quo — export BUILTINS_PREAMBLE, let callers do it themselves
//   (no API change, documented workaround)
```

Option C is fine for `0.x`. Defer Options A/B until someone reports a real
conflict. Document Option C as the workaround.

---

### Wasm delivery

**Status:** Confirmed bundle-as-npm-asset. The four files are shipped with the
package; no CDN dependency.

**Action:** No code change. Confirm in README that all four files must be
available at runtime and document any bundler configuration needed to ensure
the `.wasm` file is emitted as a static asset (not inlined or renamed).

---

## Publish Workflow (once all blockers are resolved)

```sh
# 1. Build the wasm (requires Emscripten)
cd /path/to/zsh-wasm
bin/build --with-sed --with-awk --out npm/

# 2. Verify the four built files are present
ls npm/zsh.js npm/zsh.wasm npm/zsh-runtime.js npm/zsh-worker.js

# 3. Bump version if needed
# Edit npm/package.json "version" field

# 4. Dry run
cd npm && npm publish --dry-run

# 5. Publish
npm publish --access public
```

The `prepublishOnly` script (once added) will fail step 4/5 if any file is
missing, preventing accidental publishes of incomplete packages.

---

## Not Blocking (defer to ROADMAP)

These items appear in ROADMAP.md as open questions. They do not need to be
resolved before the first publish:

- **Node.js support** — feasible but not prioritized; document as unsupported
- **Worker pooling** — not needed until cold-start latency is reported as a problem
- **Interactive shell** — large undertaking, separate from the scripting API
- **jq / bc** — additional compiled-in tools; add as optional builds like sed/awk
