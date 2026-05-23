# RubyCompared Integration

This document covers everything needed to make zsh-wasm available as an offline-capable
language runtime in the [RubyCompared](https://github.com/brandonzylstra/RubyCompared)
interactive cheatsheet site.

The core requirement is **versioned, immutable CDN URLs** — jsDelivr can serve any
file from a GitHub repo at a specific tag, and that URL never changes. RubyCompared's
service worker can then cache it permanently. Without a tag, only mutable GitHub Pages
URLs exist and permanent caching is unsafe.

---

## Step 1: Push a Version Tag

The npm package is at `0.1.4`. Tag the current commit to match:

```zsh
git tag v0.1.4
git push origin v0.1.4
```

That's all jsDelivr needs. Within minutes the following URL becomes active and permanent:

```
https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.js
https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.wasm
```

Verify: open `https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.js`
in a browser. If it returns the file, the URL is live.

**For future releases:** bump the `version` field in `npm/package.json`, run
`bin/build --out npm/`, commit, tag, push. The tag drives both the CDN URL and
the npm version.

---

## Step 2: Add a GitHub Actions Release Workflow

Manual tagging works but a workflow gives you a GitHub Releases page (with release
notes and downloadable artifacts), which is useful for tracking history.

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            web/zsh.js
            web/zsh.wasm
            web/zsh-runtime.js
            web/zsh-worker.js
```

Note: this workflow does NOT rebuild the WASM from source — it packages whatever
is in `web/` at tag time. That is intentional: the build requires Emscripten, which
is complex to set up in CI. The release captures the pre-built files that are already
committed in the repo (the `web/` directory is tracked in git).

If you later move to not committing build artifacts (analogous to bash-wasm's item 3),
add an Emscripten build step before the release step using `mymindstorm/setup-emsdk`.

---

## Step 3: Update RubyCompared

Once the tag is live, make these four changes in the RubyCompared repo:

### 3a. `lib/languages.js` — pin the head script URL and mark offline-capable

```js
// Find the zsh entry and change:
headScripts: ['<script src="https://brandonzylstra.github.io/zsh-wasm/zsh.js"></script>'],

// to:
offlineCapable: true,
headScripts: ['<script src="https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.js"></script>'],
```

The mutable GitHub Pages URL becomes the pinned jsDelivr URL. Both serve the same file,
but only the jsDelivr URL is safe to cache permanently.

### 3b. `components/ServiceWorker.astro` — add zsh to `CACHE_GROUPS`

```js
{
  slug:    'zsh',
  name:    'Zsh',
  color:   '#89e051',
  version: '0.1.4',
  pageUrl: '/ruby/zsh/',
  cdnUrls: [
    'https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.js',
    'https://cdn.jsdelivr.net/gh/brandonzylstra/zsh-wasm@v0.1.4/web/zsh.wasm',
  ],
},
```

The `cdnUrls` list should include every file the Zsh page fetches from the network.
`zsh-runtime.js` and `zsh-worker.js` are not listed because they are bundled as
Astro local assets (content-hashed, handled by the existing local-asset cache).
Only the external CDN assets need to be listed here.

**Check whether `zsh.wasm` needs to be listed separately.** The Zsh page loads
`zsh.js`, which loads `zsh.wasm` from the same path. The service worker intercepts
that sub-fetch and caches it automatically if it matches the CDN hostname. However,
pre-caching it explicitly in `cdnUrls` ensures it is available before the user
navigates to the Zsh page. Both files should be listed.

### 3c. `public/sw.js` — add to `LANGUAGE_RUNTIME_CACHES`

```js
zsh: 'codecompared-zsh-runtime-0.1.4',
```

This must stay in sync with the `version` field in the `CACHE_GROUPS` entry above.
The service worker uses this cache name to evict stale runtime caches when the
version changes.

### 3d. Verify offline behavior

After making these changes:

1. `npm run build` in RubyCompared
2. Open the built site, navigate to the Zsh page, and let it load fully
3. Open the offline modal — Zsh should appear with a download option
4. Click "Go Offline" (or download Zsh individually)
5. Disconnect from the network and reload the Zsh page — it should work

---

## Keeping Versions in Sync

Every time a new version of zsh-wasm is released:

1. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
2. In RubyCompared, update three places (all version strings change together):
   - `lib/languages.js` — `headScripts` URL tag
   - `components/ServiceWorker.astro` — `version` field and `cdnUrls` tag
   - `public/sw.js` — `LANGUAGE_RUNTIME_CACHES` value

The `version` string in `CACHE_GROUPS` drives the cache name. Changing it causes
the service worker to evict the old cache on next activate, so users automatically
pick up the new runtime on their next page load.

---

## Current Blocking Issues (as of 2026-05-23)

| Issue | Status | Fix |
|-------|--------|-----|
| No git tags | Blocks CDN URL | Push `v0.1.4` tag |
| No release workflow | Reduces release visibility | Add `release.yml` (optional but recommended) |
| GitHub Pages URL in `lib/languages.js` | Mutable, unsafe to cache | Swap after tag is live |
| `offlineCapable` not set | Zsh absent from offline modal | Set after CDN URL is in place |

All four are resolved by steps 1–3 above in order.
