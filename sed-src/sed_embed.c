/* sed_embed.c — longjmp-based exit and BSD err() replacements for embedded sed */
#include <errno.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "sed_embed.h"

jmp_buf sed_exit_jmp;
int     sed_exit_code;

void
sed_do_exit(int code)
{
    sed_exit_code = code;
    longjmp(sed_exit_jmp, 1);
}

void
sed_err(int code, const char *fmt, ...)
{
    int saved = errno;
    va_list ap;
    if (fmt && *fmt) {
        va_start(ap, fmt);
        vfprintf(stderr, fmt, ap);
        va_end(ap);
        fprintf(stderr, ": %s\n", strerror(saved));
    } else {
        fprintf(stderr, "%s\n", strerror(saved));
    }
    sed_do_exit(code);
}

void
sed_errx(int code, const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fprintf(stderr, "\n");
    sed_do_exit(code);
}

void
sed_errc(int code, int errnum, const char *fmt, ...)
{
    va_list ap;
    va_start(ap, fmt);
    vfprintf(stderr, fmt, ap);
    va_end(ap);
    fprintf(stderr, ": %s\n", strerror(errnum));
    sed_do_exit(code);
}
