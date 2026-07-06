export interface RunOptions {
  /** String to feed as standard input. Omit or pass null for no input. */
  stdin?: string | null;
  /**
   * Filesystem backend.
   * - `'memfs'` (default) — in-memory, resets on every call.
   * - `'idbfs'` — IndexedDB-backed; files under `/home/user` persist across page reloads.
   */
  fs?: 'memfs' | 'idbfs' | null;
  /**
   * Fork/pipe strategy.
   * - `'simulate'` (default) — rewrites `a | b` as temp-file chaining so pipes work without fork().
   * - `'off'` — no transformation; pipes fail silently with a diagnostic in stderr.
   * Future: `'native'` for a wasm-threads build with real fork().
   */
  fork?: 'simulate' | 'off';
  /**
   * Fall back to a CPU-spinning busy-wait for `sleep` when `SharedArrayBuffer` is
   * unavailable (i.e. the page is not cross-origin isolated — no COOP+COEP headers).
   * Without this, `sleep` is a no-op when cross-origin isolation is absent.
   * Default: `false`.
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
   */
  busySleepFallback?: boolean;
  /**
   * Milliseconds to wait for a script before giving up. If the run does not
   * finish in time (e.g. an infinite loop, or a compiled tool such as `bc` that
   * blocks when invoked more than once per run), the promise rejects with a
   * timeout error and the underlying worker is terminated and replaced, so
   * later runs are unaffected. Default: `30000`.
   */
  timeoutMs?: number;
}

export interface ZshResult {
  stdout: string;
  stderr: string;
  /** The exit code returned by zsh (0 = success). */
  exitCode: number;
}

/** A pool of pre-warmed Web Workers. Eliminates cold-start latency for sequential calls. */
export interface WorkerPool {
  /** Run a zsh script on the next available worker. */
  run(src: string, options?: RunOptions): Promise<ZshResult>;
  /** Terminate all workers and reject any queued calls. */
  shutdown(): void;
}

/**
 * Run a zsh script in a Web Worker and return its output.
 * Uses a shared pool of size 1 by default; state never leaks between calls.
 *
 * @remarks
 * **Known limitations of the zsh-wasm sandbox:**
 * - Background jobs (`cmd &`) are not supported — they abort the script.
 * - Process substitution (`<(cmd)`, `>(cmd)`) is not supported — aborts the script.
 * - `$(...)` command substitution runs in-process (no subshell isolation):
 *   variable mutations inside `$(...)` leak to the parent scope.
 * - `sleep` requires `SharedArrayBuffer` for real blocking (the page must be
 *   served with `Cross-Origin-Opener-Policy: same-origin` and
 *   `Cross-Origin-Embedder-Policy: require-corp`); without it, sleep is a no-op.
 * - The `TZ` environment variable has no effect — `date` always uses the
 *   browser's local timezone (Emscripten delegates `localtime_r` to JS `Date`).
 * - Many external binaries are not available; well-known ones (curl, git,
 *   python3, etc.) emit a helpful stderr message and return exit code 127.
 */
export function runZshScript(src: string, options?: RunOptions): Promise<ZshResult>;

/**
 * Create a pool of `size` pre-warmed workers (default 1).
 * Use `pool.run()` instead of `runZshScript()` when you need a dedicated pool
 * or want to run scripts in parallel.
 */
export function createPool(size?: number): WorkerPool;

/** Terminate the default pool used by `runZshScript()`. */
export function shutdownDefaultPool(): void;

/** Convert ANSI escape sequences to HTML `<span>` elements with inline styles. */
export function ansiToHtml(text: string): string;

/** Active filesystem backend (`'memfs'` or `'idbfs'`), resolved from `ZshWasmConfig`. */
export const ZSH_FS: string;

/** Mount point used for IDBFS persistence (default: `'/home/user'`). */
export const IDBFS_MOUNT: string;

/** Built-in zsh function shims prepended to every script (touch, cat, ls, grep, …). */
export const BUILTINS_PREAMBLE: string;
