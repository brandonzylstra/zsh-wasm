/*
 * diff_embed.c - the landing pad, the err() replacements and the fgetln shim
 * that diff_embed.h declares.  See that header for why they exist.
 */

#include <errno.h>
#include <setjmp.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Take the declarations without the macros, which would rewrite the
 * definitions below into calls to themselves. */
#include "diff_embed.h"
#undef err
#undef errx
#undef warn
#undef warnx
#undef warnc
#undef errc
#undef exit
#undef fgetln

jmp_buf diff_exit_jmp;
int     diff_exit_code;

void
diff_do_exit(int code)
{
    diff_exit_code = code;
    longjmp(diff_exit_jmp, 1);
}

static void
print_prefixed(const char *fmt, va_list ap, int errnum)
{
    fputs("diff: ", stderr);
    if (fmt && *fmt)
        vfprintf(stderr, fmt, ap);
    if (errnum >= 0) {
        if (fmt && *fmt)
            fputs(": ", stderr);
        fputs(strerror(errnum), stderr);
    }
    fputc('\n', stderr);
}

void
diff_err(int code, const char *fmt, ...)
{
    int saved = errno;
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, saved);
    va_end(ap);
    diff_do_exit(code);
}

void
diff_errx(int code, const char *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, -1);
    va_end(ap);
    diff_do_exit(code);
}

void
diff_warn(const char *fmt, ...)
{
    int saved = errno;
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, saved);
    va_end(ap);
}

void
diff_warnx(const char *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, -1);
    va_end(ap);
}

void
diff_warnc(int errnum, const char *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, errnum);
    va_end(ap);
}

void
diff_errc(int code, int errnum, const char *fmt, ...)
{
    va_list ap;

    va_start(ap, fmt);
    print_prefixed(fmt, ap, errnum);
    va_end(ap);
    diff_do_exit(code);
}

/*
 * fgetln(3) hands back a pointer into stdio's own buffer, valid until the next
 * read, and does not NUL-terminate.  Its one caller here copies the bytes out
 * immediately, so a buffer owned by this file behaves the same way.
 */
char *
diff_fgetln(FILE *fp, size_t *lenp)
{
    static char  *line;
    static size_t size;
    ssize_t       len;

    len = getline(&line, &size, fp);
    if (len <= 0)
        return NULL;
    *lenp = (size_t)len;

    return line;
}
