/* sbase_embed.c - longjmp-based exit for sbase tools compiled into zsh-wasm. */

#include "sbase_embed.h"

jmp_buf sbase_exit_jmp;
int     sbase_exit_code;

void
sbase_do_exit(int code)
{
	sbase_exit_code = code;
	longjmp(sbase_exit_jmp, 1);
}
