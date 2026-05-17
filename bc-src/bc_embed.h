/* bc_embed.h — embedding interface for Gavin Howard bc as a zsh builtin */
#ifndef BC_EMBED_H
#define BC_EMBED_H

#include <setjmp.h>

/* Longjmp target — set by the zsh module wrapper before calling bc_embed_main() */
extern jmp_buf bc_exit_jmp;
extern int     bc_exit_code;

/* Call bc_do_exit() instead of exit() inside bc source */
void bc_do_exit(int code);

/* Renamed main() */
int bc_embed_main(int argc, const char *argv[]);

#endif /* BC_EMBED_H */
