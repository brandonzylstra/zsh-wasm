/* bc_embed.c — longjmp-based exit for embedded bc */
#include <setjmp.h>
#include "bc_embed.h"

jmp_buf bc_exit_jmp;
int     bc_exit_code;

void
bc_do_exit(int code)
{
    bc_exit_code = code;
    longjmp(bc_exit_jmp, 1);
}
