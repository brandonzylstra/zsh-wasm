CodeCompared Integration
========================

This document covers everything needed to make zsh-wasm available as an offline-capable
language runtime in the [CodeCompared](https://github.com/brandonzylstra/CodeCompared)
interactive cheatsheet site.

CodeCompared lives at **https://codecompared.to**. It is a single Astro repo
(`github.com/brandonzylstra/CodeCompared`) that builds a **separate Cloudflare
Pages project per anchor language**, each attached to its own subdomain —
`ruby.codecompared.to` → the `codecompared-ruby` Pages project (Ruby-anchor
content only), `python.codecompared.to` → `codecompared-python`, and so on.
Paths are served at their natural depth (no rewrites), so a comparison page lives
at `/<anchor>/<slug>/`.

Zsh is a Ruby-anchor comparison, so its page is `/ruby/zsh/` on the Ruby Pages
project — full URL **https://ruby.codecompared.to/ruby/zsh/**. All the files the
integration touches (`lib/languages.js`, `components/ServiceWorker.astro`,
`public/sw.js`, `pages/ruby/zsh.astro`) live in that one repo.

The core requirement is **versioned, immutable CDN URLs** — jsDelivr can serve any
file from a GitHub repo at a specific tag, and that URL never changes. CodeCompared's
service worker can then cache it permanently. Without a tag, only mutable GitHub Pages
URLs exist and permanent caching is unsafe.

---

Step 1: Push a Version Tag
--------------------------

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
`bin/build --out npm/`, commit, tag, push. The tag drives the CDN URL, the npm
publish (see Step 2b), and the npm version.

---

Step 2: Add a GitHub Actions Release Workflow
---------------------------------------------

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

Step 2b: Publish to npm on Tag (already wired up)
-------------------------------------------------

`.github/workflows/publish-npm.yaml` runs on any `v*` tag push and publishes to
the npm registry. Like the GitHub Pages deploy and the release workflow, it does
NOT rebuild the WASM (Emscripten is too heavy for CI). The npm binary artifacts
are gitignored, so the workflow copies the committed build outputs from `web/`
(`zsh.js`, `zsh.wasm`, `zsh-runtime.js`, `zsh-worker.js`) into `npm/` and then
publishes. Whatever is committed under `web/` at the tagged commit is what ships,
so run `bin/build` and commit the updated `web/` outputs before tagging.

The workflow guards against two common mistakes:

- **Version mismatch** — it fails if the tag (e.g. `v0.1.5`) does not match the
  `version` field in `npm/package.json`.
- **Missing build output** — it fails if any of `zsh.js`, `zsh.wasm`,
  `zsh-runtime.js`, `zsh-worker.js` are absent from `web/`.

It publishes with `--provenance`, which is why the workflow requests
`id-token: write` permission.

### Required one-time setup: the `NPM_TOKEN` automation token

The workflow authenticates to the npm registry with a token stored in the GitHub
repository secret `NPM_TOKEN`. Until that secret exists, the publish step fails
with `ENEEDAUTH` / `401 Unauthorized`. Create it once:

**1. Generate an npm access token.**

   - Sign in at https://www.npmjs.com as `brandon.zylstra`.
   - Go to https://www.npmjs.com/settings/brandon.zylstra/tokens (avatar menu →
     **Access Tokens**).
   - Click **Generate New Token**.
   - Choose the token type:
     - **Classic token → Automation.** This is the simplest correct choice. An
       *Automation* token is designed for CI: it has read+publish rights and,
       crucially, **bypasses two-factor authentication**, which a CI run cannot
       satisfy interactively. Do **not** use a *Publish* classic token if your
       account enforces 2FA on publish — it will prompt for an OTP and the CI run
       will fail.
     - **Granular access token** (more secure, recommended if you want least
       privilege): set an expiration, restrict **Packages and scopes** to
       *Read and write* on `@brandon.zylstra/zsh-wasm` (or the whole
       `@brandon.zylstra` scope), and leave organizations unset. Granular tokens
       also bypass the interactive 2FA prompt in CI.
   - Click **Generate** and **copy the token immediately** — npm shows it only
     once. It looks like `npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`.

**2. Store it as a GitHub Actions secret.**

   - Go to the `zsh-wasm` repo on GitHub → **Settings** → **Secrets and variables**
     → **Actions** → the **Secrets** tab.
   - Click **New repository secret**.
   - **Name:** `NPM_TOKEN` (must match exactly — the workflow reads
     `secrets.NPM_TOKEN`).
   - **Value:** paste the token from step 1.
   - Click **Add secret**.

**3. (When it expires) rotate it.** Granular tokens and any token with an
   expiration will eventually stop working; the publish step will start failing
   with a 401. Repeat steps 1–2 to mint a fresh token and overwrite the
   `NPM_TOKEN` secret value. Revoke the old token from the npm tokens page.

With this in place, the release process becomes: bump `npm/package.json`, run
`bin/build --out npm/`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`.
That single tag push triggers the CDN URL activation, the npm publish, and (if
you add the Step 2 release workflow) a GitHub Release.

---

Step 3: Update CodeCompared
---------------------------

Once the tag is live, make these four changes in the CodeCompared repo. The Zsh
page is part of the Ruby anchor, so it ships in the `codecompared-ruby` Pages
project served at https://ruby.codecompared.to/ruby/zsh/:

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
  pageUrl: groupPageUrl('zsh'), // resolves to /ruby/zsh/ on the Ruby anchor
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

1. `npm run build` in CodeCompared
2. Open the built site, navigate to the Zsh page, and let it load fully
3. Open the offline modal — Zsh should appear with a download option
4. Click "Go Offline" (or download Zsh individually)
5. Disconnect from the network and reload the Zsh page — it should work

---

Keeping Versions in Sync
------------------------

Every time a new version of zsh-wasm is released:

1. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
2. In CodeCompared, update three places (all version strings change together):
   - `lib/languages.js` — `headScripts` URL tag
   - `components/ServiceWorker.astro` — `version` field and `cdnUrls` tag
   - `public/sw.js` — `LANGUAGE_RUNTIME_CACHES` value

The `version` string in `CACHE_GROUPS` drives the cache name. Changing it causes
the service worker to evict the old cache on next activate, so users automatically
pick up the new runtime on their next page load.

---

Current Blocking Issues (as of 2026-05-23)
------------------------------------------

| Issue                                  | Status                        | Fix                                          |
| -------------------------------------- | ----------------------------- | -------------------------------------------- |
| No git tags                            | Blocks CDN URL                | Push `v0.1.4` tag                            |
| No release workflow                    | Reduces release visibility    | Add `release.yml` (optional but recommended) |
| GitHub Pages URL in `lib/languages.js` | Mutable, unsafe to cache      | Swap after tag is live                       |
| `offlineCapable` not set               | Zsh absent from offline modal | Set after CDN URL is in place                |

All four are resolved by steps 1–3 above in order.
