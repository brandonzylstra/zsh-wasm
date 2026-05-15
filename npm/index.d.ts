export interface RunOptions {
  /** String to feed as standard input. Omit or pass null for no input. */
  stdin?: string | null;
  /**
   * Filesystem backend.
   * - `'memfs'` (default) — in-memory, resets on every call.
   * - `'idbfs'` — IndexedDB-backed; files under `/home/user` persist across page reloads.
   */
  fs?: 'memfs' | 'idbfs' | null;
}

export interface ZshResult {
  stdout: string;
  stderr: string;
  /** The exit code returned by zsh (0 = success). */
  exitCode: number;
}

/**
 * Run a zsh script in a Web Worker and return its output.
 * Each call spawns a fresh zsh process; no state is shared between calls
 * unless IDBFS is enabled.
 */
export function runZshScript(src: string, options?: RunOptions): Promise<ZshResult>;

/** Convert ANSI escape sequences to HTML `<span>` elements with inline styles. */
export function ansiToHtml(text: string): string;

/** Active filesystem backend (`'memfs'` or `'idbfs'`), resolved from `ZshWasmConfig`. */
export const ZSH_FS: string;

/** Mount point used for IDBFS persistence (default: `'/home/user'`). */
export const IDBFS_MOUNT: string;

/** Built-in zsh function shims prepended to every script (touch, cat, ls, grep, …). */
export const BUILTINS_PREAMBLE: string;
