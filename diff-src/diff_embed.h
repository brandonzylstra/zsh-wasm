/*
 * diff_embed.h - running OpenBSD diff inside the zsh-wasm process.
 *
 * diff is written as a program: it ends by calling exit(), it reports fatal
 * errors with err()/errx() which also exit, and it leaves its file-scope state
 * lying around because a process only runs it once.  Here it is a zsh builtin
 * sharing one wasm process with the shell and with every later `diff' in the
 * same script, so all three have to be dealt with.
 *
 * This header is included by each vendored source in place of <err.h>, and is
 * where the OpenBSD-only pieces are stubbed.  diff-src/PATCHES.md lists every
 * change made to the sources themselves.
 */

#ifndef ZSH_WASM_DIFF_EMBED_H
#define ZSH_WASM_DIFF_EMBED_H

#include <setjmp.h>
#include <stdarg.h>
#include <stdio.h>

/* Landing pad, set by the builtin wrapper in diff_mod.c before diff_main(). */
extern jmp_buf diff_exit_jmp;
extern int     diff_exit_code;

void diff_do_exit(int code);

/*
 * BSD err()/errx()/warn()/warnx().  The first two exit in the original and so
 * unwind to the landing pad here; the warn pair only print.  Emscripten does
 * ship <err.h>, but its err() would take the whole shell down with it.
 */
void diff_err(int code, const char *fmt, ...);
void diff_errx(int code, const char *fmt, ...);
void diff_warn(const char *fmt, ...);
void diff_warnx(const char *fmt, ...);
void diff_warnc(int errnum, const char *fmt, ...);
void diff_errc(int code, int errnum, const char *fmt, ...);

#define err   diff_err
#define errx  diff_errx
#define warn  diff_warn
#define warnx diff_warnx
#define warnc diff_warnc
#define errc  diff_errc

/* exit() ends the wasm module; route it to the landing pad instead. */
#define exit(code) diff_do_exit(code)

/* pledge(2) and unveil(2) are OpenBSD's; there is nothing to restrict here. */
#define pledge(promises, paths)     (0)
#define unveil(path, permissions)   (0)

/* __dead is OpenBSD's spelling of _Noreturn. */
#ifndef __dead
#define __dead __attribute__((__noreturn__))
#endif

/* fgetln(3) is BSD-only; this returns a pointer into a buffer it owns, as
 * fgetln does, so callers that copy the result need no change. */
char *diff_fgetln(FILE *fp, size_t *lenp);
#define fgetln diff_fgetln

/* Renamed from main() at compile time with -Dmain=diff_main. */
int diff_main(int argc, char **argv);

/*
 * Put every file-scope variable in diff.c and diffreg.c back to its initial
 * value.  Called at the top of diff_main().  diffreg_reset_state() lives in
 * diffreg.c, where those statics are visible.
 */
void diff_reset_state(void);
void diffreg_reset_state(void);

#endif /* ZSH_WASM_DIFF_EMBED_H */
