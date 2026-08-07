npm Publish Checklist
=====================

This started as a list of things to do before the first publish. The package
published anyway, several times, while most of the list stayed open — so read
the status column, not the fact that an item exists.

**Everything on it is now closed, as of 2026-08-07.** What remains below is the
reasoning, kept because it explains why each thing is the way it is.

---

Quick Checklist
---------------

### Blockers — all closed

- [x] **LICENSE file** — `LICENSE` and `THIRD_PARTY_LICENSES.md` at the repo
      root, both shipped in the package. `"license"` is now
      `"SEE LICENSE IN LICENSE"`, because no single identifier honestly
      describes a binary made of six codebases — and `"Zsh"`, which it said for
      five releases, is not among npm's 695 recognized identifiers at all.
- [x] **Populate `npm/` with built files** — the tag-push workflow stages them
      from `web/`; `bin/build --out npm/` does it locally. Both now also copy
      the two license files.
- [x] **`prepublishOnly` script** — `npm/check-built.js`. Catches a missing or
      empty build output, an implausibly small `zsh.wasm`, a missing license
      file, a `license` field that has been changed back, and — the one that
      matters most — `npm/*.js` having drifted from `web/*.js`, which is how a
      publish silently ships stale JavaScript.
- [x] **`isRuntimeNoise` type gap** — declared. Verified by type-checking a
      consumer that imports it against the old declarations (TS2305) and the
      new ones (clean).
- [x] **`engines` field** — **deliberately not added.** npm only validates
      `node` and `npm` there, so the proposed `"browser": "*"` would have been
      silently ignored: a field that looks like a guard and guards nothing.
      Replaced with a thrown error naming the actual problem, plus a README
      section.
- [x] **Bundler smoke test** — done, and it found a real bug. See below.
- [x] **Version bump** — long since overtaken; the package is past 0.5.0.

### Should do — all closed

- [x] **Document `ZshWasmConfig` global** — kept rather than removed, and
      documented in both the package README and `index.d.ts`. It earns its keep
      for callers who cannot reach every call site.
- [x] **Document wasm asset size** — measured, not estimated: 1.34 MB raw,
      554 KB gzipped, ~610 KB gzipped over the wire with the loader. Every
      earlier "~900 KB" in these docs predated sed, awk, bc, diff and the
      seventeen coreutils.
- [x] **Document Node.js non-support** — README, plus an error that says so.
- [x] **Document `BUILTINS_PREAMBLE`** — what is in it, and that a user's own
      function of the same name wins because the preamble is prepended. Both
      verified with `bin/run-script`, not assumed.

### Open decisions — settled

- [x] **Preamble opt-out API** — Option C (status quo): no flag. The preamble is
      always prepended, `BUILTINS_PREAMBLE` is exported, and redefining a shim
      in your own script already overrides it. Revisit if someone reports a
      conflict that this does not cover.
- [x] **Wasm delivery** — bundle as npm asset, size documented.

---

What the bundler smoke test found (2026-08-07)
----------------------------------------------

Worth recording, because it is the reason to run a smoke test at all rather than
reason about one.

Both READMEs had said since 0.1.x that Vite and Webpack 5 "handle automatically"
the way this package loads. Building a project that installed the published
tarball produced a `dist/` with the worker chunk and nothing else — no `zsh.js`,
no `zsh.wasm` — and the page hung on a 404 for `/assets/zsh.js`. **Five releases
shipped in a state where no bundled build could ever have worked**, because
nobody had built the package through a bundler.

The cause was one line: the worker loaded the Emscripten runtime with
`importScripts('./zsh.js')`. A bundler cannot see a dependency inside a string,
so it emitted neither the loader nor the wasm the loader then fetches.

The fix moved both URLs into `new URL(..., import.meta.url)` expressions in
`zsh-runtime.js`, which bundlers do read statically, and passes them to the
worker in an `init` message. `locateFile` is set from the same message, so a
content-hashed `zsh-XVyxQy0i.wasm` is still found — Emscripten would otherwise
derive the name from the hashed loader and miss.

Verified after the fix, on Vite 5 and Webpack 5, neither needing any
configuration: both emit the worker, the loader and the wasm, and both run
zsh 5.9, a `sort | tr` pipeline, `bc` from a pipe and `diff -u` from a pipe —
exit code 0, no failed requests. Webpack minifies `zsh.js` on the way through,
which turns out to be harmless. esbuild is still unverified. The unbundled path
was unchanged at 351 passing and 2 known-fail.

**The lesson for next time:** the test project must install a real tarball
(`npm pack` then install the `.tgz`), not a `file:` reference to `npm/`. A
`file:` dependency symlinks, which resolves paths the way the repository does
and hides exactly this class of bug.

---

Detail: Each Item
-----------------

---

### LICENSE file

**Status: DONE (2026-08-07).** `LICENSE` and `THIRD_PARTY_LICENSES.md` are at
the repo root and ship inside the package. Was: missing from repo root.

The npm registry requires a `license` field. `"license": "Zsh"` was not a valid
SPDX identifier — checked against the list npm validates against, which has 695
entries and nothing matching "zsh" at all — so the registry showed it as
unrecognized for five releases.

What this section originally listed as three bundled components turned out to be
six, since bc, sbase and diff all landed afterwards. The full and current list
is in `THIRD_PARTY_LICENSES.md`; the table below is left as written at the time:

| Component                                              | License                                         |
| ------------------------------------------------------ | ----------------------------------------------- |
| Zsh 5.9 (`zsh-5.9/LICENCE`)                            | MIT-like (Zsh Development Group)                |
| OpenBSD sed (`sed-src/`)                               | BSD-3-Clause                                    |
| one-true-awk (`awk-20260426/LICENSE`)                  | Lucent Technologies (permissive, not OSI-named) |
| glue code (`web/`, `awk-src/`, `sed-src/*.c` wrappers) | choose a license (MIT recommended)              |

**What was actually done:**

1. The glue code is under the Zsh license, not MIT — Brandon had already chosen
   that, and matching the interpreter keeps the story simple.
2. `LICENSE` at the repo root carries that grant plus the Zsh license verbatim.
3. `THIRD_PARTY_LICENSES.md` at the repo root carries all six texts, each
   extracted from the source file it governs rather than transcribed, so they
   are byte-exact. Both files ship in the package and are copied into `npm/` by
   `bin/build --out` and by the publish workflow.
4. `"license"` is `"SEE LICENSE IN LICENSE"` — npm's own convention for a
   custom or combined license, and the honest answer for a binary made of six
   codebases.

---

### Populate `npm/` with built files

**Status: DONE.** The workflow stages the built files from `web/` on a tag push,
and copies the two license files in as well. Was: `npm/` contained only
`package.json` and `index.d.ts`.
The runtime files (`zsh-runtime.js`, `zsh-worker.js`, `zsh.js`, `zsh.wasm`)
must be built and copied there before publishing.

**How it works today:**

```sh
bin/build [--with-sed] [--with-awk] --out npm/
```

This runs the full wasm build and then copies four files into `npm/`:
- `zsh.js` (Emscripten loader)
- `zsh.wasm` (1.34 MB uncompressed, 554 KB gzipped as of 0.6.0; the
  "~900 KB" this said before predates bc, diff and the seventeen coreutils)
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

**Status: DONE.** `npm/check-built.js`, wired to `prepublishOnly`. It goes
further than this section proposed — see the staleness check below.

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

**Status: DONE.** Declared, and the gap confirmed real first: the same consumer
fails with TS2305 against the old declarations and type-checks clean against the
new ones. Was: `zsh-runtime.js` exported `isRuntimeNoise` but `index.d.ts` did not
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

**Status: CLOSED — deliberately not done.** npm validates only `node` and `npm`
in `engines`, so the `"browser": "*"` proposed below would be silently ignored:
a field that looks like a guard and guards nothing. What shipped instead is a
thrown error naming the real problem, plus a README section. The package uses
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

**Status: DONE, and it found a real bug** — see "What the bundler smoke test
found" at the top of this file. The risks guessed at below were close: the wasm
resolution was indeed the problem, though the loader went missing first. Was:
the package worked when loaded from `web/index.html` directly, but
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

**Status: OVERTAKEN.** The package is well past this; the version policy below
still holds. Was: `npm/package.json` at `0.1.0`, set before sed, awk, 13
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

**Status: DONE — Option A.** Kept and documented in the package README and in
`index.d.ts`. `zsh-runtime.js` reads `globalThis.ZshWasmConfig?.fs` at module
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

**Status: DONE.** Measured rather than estimated: 1.34 MB raw, 554 KB gzipped,
~610 KB over the wire with the loader. Note every "~900 KB" below is stale — it
predates bc, diff and the seventeen coreutils.

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

**Status: DONE.** Stated in both READMEs, and `runZshScript` now throws an error
that says the package is browser-only instead of failing on an undefined global.

**Action:** One sentence in the README npm section and in the `engines` field
(see above). Also consider adding a runtime check at the top of `zsh-worker.js`
that throws a clear error if loaded outside a browser context.

---

### Document `BUILTINS_PREAMBLE`

**Status: DONE.** The package README now covers what is in the preamble and that
redefining a shim in your own script overrides it — verified with
`bin/run-script`, not assumed. Was: `BUILTINS_PREAMBLE` exported and declared with a
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

**Status: SETTLED — Option C.** No opt-out flag. The preamble is always
prepended, `BUILTINS_PREAMBLE` is exported, and defining your own function of the
same name already overrides the shim. Revisit only on a concrete report this
does not cover.

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

Publish Workflow (once all blockers are resolved)
-------------------------------------------------

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

Not Blocking (defer to ROADMAP)
-------------------------------

These items appear in ROADMAP.md as open questions. They do not need to be
resolved before the first publish:

- **Node.js support** — feasible but not prioritized; document as unsupported
- **Worker pooling** — not needed until cold-start latency is reported as a problem
- **Interactive shell** — large undertaking, separate from the scripting API
- **jq / bc** — additional compiled-in tools; add as optional builds like sed/awk
