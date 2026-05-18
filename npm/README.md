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
- **`sleep` needs cross-origin isolation** — real blocking requires `SharedArrayBuffer`, which requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. Without them, `sleep` is a no-op.
- **`TZ` env var ignored** — `date` always uses the browser's local timezone (Emscripten delegates `localtime_r` to JS `Date`). `%z` correctly shows the UTC offset.
- **stdin is newline-terminated** — a trailing `\n` is always appended if missing (correct POSIX behavior; transparent to line-oriented tools).
- **No ZLE** — the interactive line editor and completion system are excluded (no real terminal).

## Demo

[zsh-wasm demo site](https://github.com/brandonzylstra/zsh-wasm)

## License

[The Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE)
