/* sed_embed.h — embedding interface for OpenBSD sed as a zsh builtin */
#ifndef SED_EMBED_H
#define SED_EMBED_H

#include <setjmp.h>
#include <stdarg.h>

/* Longjmp target — set by the zsh module wrapper before calling sed_main() */
extern jmp_buf sed_exit_jmp;
extern int     sed_exit_code;

/* Call sed_do_exit() instead of exit() inside sed source */
void sed_do_exit(int code);

/* BSD err()/errx()/errc() replacements that call sed_do_exit() */
void sed_err (int code, const char *fmt, ...);
void sed_errx(int code, const char *fmt, ...);
void sed_errc(int code, int errnum, const char *fmt, ...);

/* pledge(2) is OpenBSD-only; stub it out */
#define pledge(promises, paths) (0)

/* Renamed main() */
int  sed_main(int argc, char **argv);

/* Reset process.c file-scope statics between calls in the same worker */
void sed_full_reset(void);

#endif /* SED_EMBED_H */
