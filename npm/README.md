# @brandon.zylstra/zsh-wasm

Zsh 5.9 compiled to WebAssembly — run a real zsh interpreter in the browser, inside a Web Worker.

## Install

```
npm install @brandon.zylstra/zsh-wasm
```

## Usage

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

## Worker pool

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

## Bundler note

`zsh-runtime.js` spawns a worker via `new Worker(new URL('./zsh-worker.js', import.meta.url))`, which Vite and Webpack 5 handle automatically. The `zsh.wasm` binary is loaded by Emscripten's runtime relative to the JS file — if your bundler moves the wasm, configure it to emit wasm as a static asset.

## Available commands

Zsh builtins work as-is. The following external commands are shimmed:

| Command   | Flags supported |
|-----------|-----------------|
| `ls`      | `-a`/`-A` `-l` `-R` |
| `cat`     | — |
| `touch`   | — |
| `cp`      | — |
| `mv`      | — |
| `rm`      | `-f` `-r`/`-rf` |
| `mkdir`   | (native) |
| `ln`      | `-s` `-f` |
| `wc`      | `-l` `-w` `-c` |
| `head`    | `-n N` `-N` `-c N` |
| `tail`    | `-n N` `-N` `-c N` |
| `grep`    | `-i` `-v` `-n` `-c` `-r`/`-R` `-l` `-o` `-q` `-w` `-e` `-m N` `-A`/`-B`/`-C N` `-H`/`-h` |
| `sort`    | `-r` `-n` `-u` `-k N` |
| `uniq`    | — |
| `cut`     | `-d` `-f` `-c` |
| `tr`      | `-d` (stdin only) |
| `sed`     | `s/pat/repl/[g]` `-n` `-e` `-i ''` (stdin only) |
| `awk`     | patterns, BEGIN/END, `-F` `-v` (file args / `<<<` only) |
| `find`    | `-name` `-type` `-maxdepth` `-newer` |
| `xargs`   | `-I` `-n` |
| `tee`     | `-a` |
| `date`    | `+FORMAT` |
| `seq`     | `N`, `start N`, `start step N` |
| `sleep`   | seconds (float) |
| `mktemp`  | `-d`, template |
| `env`     | `VAR=val` `-u VAR` |
| `printenv`| `[VAR ...]` |
| `which`   | — |
| `realpath`| — |
| `basename`| suffix arg |
| `dirname` | — |
| `base64`  | `-d`/`--decode` |
| `bc` / `dc` | arbitrary-precision math (via `zsh/mathfunc` and `<<<` input) |

Well-known unavailable commands (curl, git, python3, docker, etc.) emit a helpful stderr message and return exit code 127 without aborting the script.

## Known limitations

- **No fork** — background jobs (`cmd &`), process substitution (`<(cmd)`), and unsupported external binaries all require `fork()`, which is not available in WebAssembly.
- **`$(...)` runs in-process** — no true subshell isolation; variable assignments inside `$(...)` leak to the parent scope.
- **`sleep` needs cross-origin isolation for real blocking** — `SharedArrayBuffer` (required for `Atomics.wait`) is only available when the page is cross-origin isolated. Without it, `sleep` is a no-op unless you pass `busySleepFallback: true` to `RunOptions`, which uses a CPU-spinning busy-wait instead. See [Cross-origin isolation](#cross-origin-isolation) below.
- **`TZ` supports UTC offsets only** — `TZ=UTC`, `TZ=UTC±H`, `TZ=UTC±H:MM`, and `TZ=±HH:MM` work. Named timezones (`TZ=America/New_York`) are not supported (no tzdata); `date` falls back to browser local time with a stderr warning.
- **stdin is newline-terminated** — a trailing `\n` is always appended if missing (correct POSIX behavior; transparent to line-oriented tools).
- **No ZLE** — the interactive line editor and completion system are excluded (no real terminal).

## Cross-origin isolation

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

## Demo

[zsh-wasm demo site](https://github.com/brandonzylstra/zsh-wasm)

## License

[The Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE)
