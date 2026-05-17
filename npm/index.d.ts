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
