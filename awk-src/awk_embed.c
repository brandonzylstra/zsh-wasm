/* awk_embed.c — longjmp-based exit for embedded awk */
#include <setjmp.h>
#include <stdnoreturn.h>
#include "awk_embed.h"

jmp_buf awk_exit_jmp;
int     awk_exit_code;

noreturn void
awk_do_exit(int code)
{
    awk_exit_code = code;
    longjmp(awk_exit_jmp, 1);
}
