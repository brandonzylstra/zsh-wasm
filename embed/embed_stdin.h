/*
 * embed_stdin.h - shared stdin reset for the tools compiled into zsh-wasm.
 *
 * sed, awk and bc are compiled into the wasm binary as zsh builtins, so unlike
 * real commands they do not get a fresh process per invocation: every call in a
 * script shares one `stdin` FILE object for the life of the wasm module, even
 * though the underlying descriptor is a different file each time (each pipeline
 * stage and each here-string is its own temp file, dup2()ed onto fd 0).
 *
 * That leaves stdio state from the previous call behind.  The end-of-file flag
 * is the damaging one: the second `echo x | sed ...` in a script would read
 * nothing at all, because getc() reports EOF from the flag without ever
 * touching the new descriptor.  Any input still sitting in the buffer is stale
 * for the same reason and must go too.
 *
 * Call this at the top of each builtin, before the tool reads anything.
 */

#ifndef ZSH_WASM_EMBED_STDIN_H
#define ZSH_WASM_EMBED_STDIN_H

#include <stdio.h>

static void
reset_embedded_stdin(void)
{
    /* Discards whatever is buffered; on a drained stream this is a no-op. */
    fflush(stdin);
    /* Drops the sticky end-of-file and error flags. */
    clearerr(stdin);
}

#endif /* ZSH_WASM_EMBED_STDIN_H */
