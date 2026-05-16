/* awk_embed.h — embedding interface for one-true-awk as a zsh builtin */
#ifndef AWK_EMBED_H
#define AWK_EMBED_H

#include <setjmp.h>
#include <stdnoreturn.h>

/* Longjmp target — set by the zsh module wrapper before calling awk_main() */
extern jmp_buf awk_exit_jmp;
extern int     awk_exit_code;

/* Call awk_do_exit() instead of exit() inside awk source */
noreturn void awk_do_exit(int code);

/* Renamed main() */
int  awk_main(int argc, char **argv);

#endif /* AWK_EMBED_H */
