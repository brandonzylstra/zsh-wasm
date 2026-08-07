@brandon.zylstra/zsh-wasm
=========================

Zsh 5.9 compiled to WebAssembly — run a real zsh interpreter in the browser, inside a Web Worker.

Install
-------

```
npm install @brandon.zylstra/zsh-wasm
```

Usage
-----

```js
import { runZshScript } from '@brandon.zylstra/zsh-wasm';

const { stdout, stderr } = await runZshScript('echo "Hello from zsh $ZSH_VERSION"');
console.log(stdout); // Hello from zsh 5.9

// Pass stdin
const { stdout: out } = await runZshScript(
    'while IFS= read -r line; do echo "> $line"; done',
    { stdin: 'hello\nworld' }
);

// Persistent filesystem via IndexedDB (browser only)
const { stdout: files } = await runZshScript('ls /home/user', { fs: 'idbfs' });
```

The script runs in a Web Worker — the main thread never blocks.

Worker pool
-----------

For high-throughput use, create a pool to run scripts in parallel:

```js
import { createPool } from '@brandon.zylstra/zsh-wasm';

const pool = createPool(4); // 4 workers
const results = await Promise.all([
    pool.run('echo one'),
    pool.run('echo two'),
    pool.run('echo three'),
]);
pool.shutdown();
```

`runZshScript()` uses a shared pool of size 1 by default; state never leaks between calls.

Choosing the filesystem
-----------------------

By default every run starts from a clean in-memory filesystem, so nothing
survives from one call to the next. Pass `fs: 'idbfs'` to keep files written
under `/home/user` in IndexedDB, across both later calls and page reloads:

```js
await runZshScript('echo saved > /home/user/note', { fs: 'idbfs' });
await runZshScript('cat /home/user/note', { fs: 'idbfs' }); // saved
```

To change the default for every call instead of passing it each time, set a
global **before** importing the package — it is read once at import:

```js
globalThis.ZshWasmConfig = { fs: 'idbfs' };
const { runZshScript } = await import('@brandon.zylstra/zsh-wasm');
```

The per-call option always wins over the global, so the global is only worth
using when you cannot reach every call site.

Built-in shims
--------------

Because there is no `fork()`, a handful of external utilities are provided as
zsh functions rather than programs. They are defined in `BUILTINS_PREAMBLE`,
which is prepended to every script automatically: `cp`, `mv`, `rm`, `ln`,
`find`, `xargs`, `env`, `which`, `date`, `sleep`, `realpath`, `base64`, plus
stubs that give a clear message for binaries that are genuinely unavailable
(`curl`, `git`, `python3` and friends return exit code 127 with an explanation).

Everything else in the table above is a real program compiled into the binary,
not a shim.

If your script defines a function with one of those names, yours wins — the
preamble is prepended, so your later definition replaces it. To replace one
deliberately while keeping the rest, append your version:

```js
import { runZshScript, BUILTINS_PREAMBLE } from '@brandon.zylstra/zsh-wasm';

// BUILTINS_PREAMBLE is exported so you can inspect it or build on it.
console.log(BUILTINS_PREAMBLE.length); // ~12 KB of zsh

await runZshScript(`
    date() { print -- 'always the same day' }
    date
`);
```

There is no option to skip the preamble. If you need that, say so in an issue.

Bundlers
--------

Three files have to reach the browser: the worker, the Emscripten loader
(`zsh.js`), and the binary (`zsh.wasm`). The runtime points at all three with
`new URL('./file', import.meta.url)`, the form bundlers read statically, so a
bundler emits them as assets and rewrites the URLs to wherever it puts them —
including content-hashed names.

**Vite 5 and Webpack 5: both verified, neither needs configuration.** A project
that installs this package and builds gets the worker, the loader and the wasm
emitted as assets, and runs correctly from the built output. Both were tested
against a real tarball install, running zsh plus a pipeline through the compiled
`sort`, `tr`, `bc` and `diff`. Webpack minifies `zsh.js` on the way through and
that turns out to be harmless.

**esbuild: not verified.** It supports the same convention, so it is expected to
work. If it does not, please open an issue.

If your bundler does not understand that convention, copy `zsh.js` and
`zsh.wasm` out of the package into a directory it serves verbatim, and make sure
it does not rename them relative to each other.

> Before 0.6.0 this did not work at all. The worker used to load the runtime
> through `importScripts('./zsh.js')` — a string, which a bundler cannot see
> into — so neither the loader nor the wasm was emitted and the page hung on a
> 404. If you are on 0.5.0 or earlier and bundling, upgrade.

Size
----

The wasm binary is the bulk of it, and it is worth knowing before you install.

| File                               | Raw     | Gzipped |
| ---------------------------------- | ------- | ------- |
| `zsh.wasm`                         | 1.34 MB | 554 KB  |
| `zsh.js` (Emscripten loader)       | 215 KB  | 55 KB   |
| `zsh-runtime.js` + `zsh-worker.js` | 27 KB   | —       |

About **610 KB over the wire** gzipped. That buys zsh 5.9 itself plus `sed`,
`awk`, `bc`, `diff` and seventeen coreutils compiled in as real programs rather
than imitations. Interactive line editing and completion are excluded, since
there is no terminal.

The binary is immutable at a versioned URL, so it caches permanently — the cost
is paid once per release, not per page view.

Browsers only
-------------

This package needs Web Workers and `import.meta.url`. **Node.js is not
supported** and there is no plan to support it; use a real zsh subprocess there.
Calling `runZshScript` outside a browser throws an error saying so rather than
failing obscurely.

Available commands
------------------

Real implementations compiled into the wasm binary — these are the tools, not
imitations of them:

| Command                             | Source          | Notes                                                          |
| ----------------------------------- | --------------- | -------------------------------------------------------------- |
| `sed`                               | OpenBSD sed     | `s/pat/repl/[g]`, `-n`, `-e`, `-i`, address ranges, hold space |
| `awk`                               | one-true-awk    | patterns, BEGIN/END, `-F`, `-v`, gsub/split/printf             |
| `bc`/`dc`                           | Gavin Howard bc | arbitrary precision, `scale`, `sqrt()`, functions              |
| `wc`                                | sbase           | `-l` `-w` `-c` `-m`, `total` line for multiple files           |
| `sort`                              | sbase           | `-b -C -c -d -f -i -k -m -n -o -r -t -u`                       |
| `cut`                               | sbase           | `-b -c -d -f -n -s`                                            |
| `head`                              | sbase           | `-n N` `-N` `-c N`                                             |
| `tail`                              | sbase           | `-n N` `-N` `-n +N` `-c N`                                     |
| `uniq`                              | sbase           | `-c -d -u -f -s`                                               |
| `tr`                                | sbase           | full set translation, `-c -C -d -s`                            |
| `cat`                               | sbase           | `-u`                                                           |
| `tee`                               | sbase           | `-a -i`                                                        |
| `seq`                               | sbase           | `-f -s -w`                                                     |
| `touch`                             | sbase           | `-a -c -m -d -t -T -r`                                         |
| `mktemp`                            | sbase           | `-d -q -t -u -p`                                               |
| `ls`                                | sbase           | `-1 -A -a -d -F -h -i -l -p -R -r -t -U -u`; symlink targets   |
| `basename` / `dirname` / `printenv` | sbase           | POSIX                                                          |

Provided as zsh functions, where the shell knows something a compiled tool
would not, or where the tool would need `fork()`:

| Command     | Flags                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| `cp` / `mv` | —                                                                                        |
| `rm`        | `-f` `-r`/`-rf`                                                                          |
| `mkdir`     | (native syscall)                                                                         |
| `ln`        | `-s` `-f` (symlinks only; MEMFS has no hard links)                                       |
| `grep`      | `-i` `-v` `-n` `-c` `-r`/`-R` `-l` `-o` `-q` `-w` `-e` `-m N` `-A`/`-B`/`-C N` `-H`/`-h` |
| `find`      | `-name` `-type` `-maxdepth` `-newer`                                                     |
| `xargs`     | `-I` `-n`                                                                                |
| `env`       | `VAR=val` `-u VAR`                                                                       |
| `which`     | knows shell functions and builtins                                                       |
| `date`      | `+FORMAT`, browser timezone                                                              |
| `sleep`     | seconds (float), real blocking with COOP+COEP                                            |
| `realpath`  | —                                                                                        |
| `base64`    | `-d`/`--decode`                                                                          |

Known limitations
-----------------

- **No fork** — process substitution (`<(cmd)`) and unsupported external binaries require `fork()`, which is not available in WebAssembly. `cmd &` runs `cmd` synchronously instead of in the background.
- **Pipelines run one stage at a time** — `a | b | c` works, but because there are no processes to run in parallel, each stage runs to completion before the next starts, and all of them share this shell. So a pipeline never streams (`cmd | head -1` still runs `cmd` to the end), an assignment in a stage outlives it (`echo x | read value` leaves `value` set), and `exit` in a stage ends the whole script.
- **`$(...)` runs in-process** — no true subshell isolation; variable assignments inside `$(...)` leak to the parent scope.
- **`sleep` needs cross-origin isolation for real blocking** — `SharedArrayBuffer` (required for `Atomics.wait`) is only available when the page is cross-origin isolated. Without it, `sleep` is a no-op unless you pass `busySleepFallback: true` to `RunOptions`, which uses a CPU-spinning busy-wait instead. See [Cross-origin isolation](#cross-origin-isolation) below.
- **`TZ` supports UTC offsets only** — `TZ=UTC`, `TZ=UTC±H`, `TZ=UTC±H:MM`, and `TZ=±HH:MM` work. Named timezones (`TZ=America/New_York`) are not supported (no tzdata); `date` falls back to browser local time with a stderr warning.
- **stdin is newline-terminated** — a trailing `\n` is always appended if missing (correct POSIX behavior; transparent to line-oriented tools).
- **No ZLE** — the interactive line editor and completion system are excluded (no real terminal).

Cross-origin isolation
----------------------

`sleep` uses `Atomics.wait()` for real blocking, which requires [`SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer), which requires cross-origin isolation.

**Check whether your page is isolated:**

```js
if (crossOriginIsolated) {
    // SharedArrayBuffer available — sleep works correctly
} else {
    // sleep will be a no-op (or use busySleepFallback: true for a CPU spin-wait)
}
```

**Set up cross-origin isolation** by sending these two HTTP headers on your page (not just your assets — the HTML document itself):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Common server configurations:

```nginx
# nginx
add_header Cross-Origin-Opener-Policy  "same-origin";
add_header Cross-Origin-Embedder-Policy "require-corp";
```

```apache
# Apache (.htaccess or VirtualHost)
Header set Cross-Origin-Opener-Policy  "same-origin"
Header set Cross-Origin-Embedder-Policy "require-corp"
```

```js
// Express
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy',  'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});
```

```js
// Vite (vite.config.js)
export default {
    server: {
        headers: {
            'Cross-Origin-Opener-Policy':  'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
};
```

```json
// Vercel (vercel.json)
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy",  "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

```toml
# Netlify (_headers file)
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

> **Note:** COEP `require-corp` means every resource loaded by your page (images, scripts, fonts, iframes) must either be same-origin or served with a `Cross-Origin-Resource-Policy: cross-origin` header. If you load third-party resources that don't set this header, use `credentialless` instead of `require-corp` (supported in Chrome/Edge; Firefox support is in progress).

**Fallback without cross-origin isolation:**

If you can't set the headers (e.g., a shared hosting environment), you can opt into a CPU-spinning busy-wait:

```js
await runZshScript('sleep 1; echo done', { busySleepFallback: true });
```

This actually sleeps for the right duration but burns CPU. Fine for short sleeps in development; avoid for long sleeps in production.

Demo
----

[zsh-wasm demo site](https://github.com/brandonzylstra/zsh-wasm)

License
-------

zsh-wasm's own code is under the Zsh license. See **`LICENSE`**, shipped in this
package.

`zsh.wasm` is a single binary containing six separate codebases, and they are
not all under that license. **`THIRD_PARTY_LICENSES.md`**, also shipped here,
carries all six texts verbatim.

| Bundled              | License                           |
| -------------------- | --------------------------------- |
| Zsh 5.9              | Zsh (MIT-like)                    |
| OpenBSD sed          | BSD-3-Clause                      |
| one-true-awk         | Lucent 1997                       |
| Gavin Howard bc      | BSD-2-Clause                      |
| sbase (17 coreutils) | MIT                               |
| OpenBSD diff         | ISC + BSD-3-Clause + BSD-4-Clause |

All six are permissive and none conflicts with another. Two say something about
names in advertising, and they say opposite things: the Lucent terms ask that
Lucent not be named in advertising, and the Caldera terms covering OpenBSD
diff's `diffreg.c` ask that Caldera *be* acknowledged in advertising. Both bind
advertising material only — not the software, not its documentation.
Redistributing this package does not trigger either.

If you redistribute the package or a bundle built from it, ship
`THIRD_PARTY_LICENSES.md` along with it. That is what satisfies the notices.
