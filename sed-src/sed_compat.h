/* sed_compat.h — portability stubs for OpenBSD sed on non-BSD/musl targets */
#ifndef SED_COMPAT_H
#define SED_COMPAT_H

#include <errno.h>
#include <stdlib.h>

/* strtonum(3) — OpenBSD extension, not in POSIX or musl.
 * Only define if the platform doesn't already provide it. */
#ifndef HAVE_STRTONUM
static inline long long
strtonum(const char *nptr, long long minval, long long maxval,
    const char **errstrp)
{
    char *ep;
    long long val;
    errno = 0;
    val = strtoll(nptr, &ep, 10);
    if (errstrp) *errstrp = NULL;
    if (ep == nptr || *ep != '\0' || errno != 0) {
        if (errstrp) *errstrp = "invalid"; return 0;
    }
    if (val < minval) { if (errstrp) *errstrp = "too small"; return minval; }
    if (val > maxval) { if (errstrp) *errstrp = "too large"; return maxval; }
    return val;
}
#endif

/* ALLPERMS — BSD file permission mask (all 9 permission bits) */
#ifndef ALLPERMS
# define ALLPERMS 0777
#endif

/* DEFFILEMODE — default mode for new files (rw-rw-rw- before umask) */
#ifndef DEFFILEMODE
# define DEFFILEMODE 0666
#endif

#endif /* SED_COMPAT_H */
