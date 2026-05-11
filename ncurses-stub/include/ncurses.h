#ifndef NCURSES_STUB_H
#define NCURSES_STUB_H

#define ERR  (-1)
#define OK   (0)

typedef struct { int dummy; } TERMINAL;
extern TERMINAL *cur_term;

extern int    tgetent(char *bp, const char *name);
extern char  *tgetstr(const char *id, char **area);
extern int    tgetnum(const char *id);
extern int    tgetflag(const char *id);
extern char  *tgoto(const char *cap, int col, int row);
extern int    tputs(const char *str, int affcnt, int (*putc)(int));

extern int        setupterm(const char *term, int fd, int *errp);
extern TERMINAL  *set_curterm(TERMINAL *nterm);
extern int        del_curterm(TERMINAL *oterm);

extern char  *tigetstr(const char *capname);
extern int    tigetnum(const char *capname);
extern int    tigetflag(const char *capname);
extern char  *tparm(const char *str, ...);
extern int    putp(const char *str);
extern int    baudrate(void);

#endif /* NCURSES_STUB_H */
