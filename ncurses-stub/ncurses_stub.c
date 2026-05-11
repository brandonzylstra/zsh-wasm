#include <stdarg.h>
#include <signal.h>
#include "include/ncurses.h"

TERMINAL *cur_term = 0;

int   tgetent(char *bp, const char *name)            { return 0; }
char *tgetstr(const char *id, char **area)           { return 0; }
int   tgetnum(const char *id)                        { return -1; }
int   tgetflag(const char *id)                       { return 0; }
char *tgoto(const char *cap, int col, int row)       { return 0; }
int   tputs(const char *str, int affcnt, int (*putc)(int)) { return 0; }

int       setupterm(const char *term, int fd, int *errp) {
    if (errp) *errp = 0;
    return ERR;
}
TERMINAL *set_curterm(TERMINAL *nterm)               { return 0; }
int       del_curterm(TERMINAL *oterm)               { return 0; }

char *tigetstr(const char *capname)  { return (char *)-1; }
int   tigetnum(const char *capname)  { return -2; }
int   tigetflag(const char *capname) { return -1; }
int   putp(const char *str)          { return 0; }
int   baudrate(void)                 { return 9600; }

char *tparm(const char *str, ...) { return 0; }

/* POSIX signal functions not available in wasm */
int sigsuspend(const sigset_t *mask) { return -1; }
