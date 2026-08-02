/*
 * sbase_embed.h - running sbase tools inside the zsh-wasm process.
 *
 * sbase tools are written as programs: they exit() on a fatal error and fclose()
 * the standard streams on the way out. Neither is survivable when the "program"
 * is a zsh builtin sharing one wasm process with the shell and with every later
 * invocation of itself. Two upstream files are patched for this (both diffs are
 * listed in sbase-src/PATCHES.md):
 *
 *   libutil/eprintf.c  exit() -> sbase_do_exit(), which longjmps back to the
 *                      builtin wrapper. This is the single fatal-error funnel
 *                      for every sbase tool, which is why the change is two
 *                      lines rather than one per tool.
 *   libutil/fshut.c    do not fclose stdin/stdout/stderr. Closing the shell's
 *                      own descriptors ends the session; the flush and the
 *                      ferror check are still wanted.
 *
 * Each tool additionally resets its own file-scope statics at the top of its
 * main(), because a builtin is entered many times per script and a program only
 * once. Those resets are in the tool sources themselves.
 */

#ifndef ZSH_WASM_SBASE_EMBED_H
#define ZSH_WASM_SBASE_EMBED_H

#include <setjmp.h>
#include <stdio.h>

extern jmp_buf sbase_exit_jmp;
extern int     sbase_exit_code;

void sbase_do_exit(int code);

/* Renamed from main() at compile time with -Dmain=<tool>_main. */
int basename_main(int argc, char *argv[]);
int cat_main(int argc, char *argv[]);
int cut_main(int argc, char *argv[]);
int dirname_main(int argc, char *argv[]);
int head_main(int argc, char *argv[]);
int mktemp_main(int argc, char *argv[]);
int printenv_main(int argc, char *argv[]);
int seq_main(int argc, char *argv[]);
int sort_main(int argc, char *argv[]);
int tail_main(int argc, char *argv[]);
int tee_main(int argc, char *argv[]);
int touch_main(int argc, char *argv[]);
int tr_main(int argc, char *argv[]);
int uniq_main(int argc, char *argv[]);
int wc_main(int argc, char *argv[]);

#endif /* ZSH_WASM_SBASE_EMBED_H */
