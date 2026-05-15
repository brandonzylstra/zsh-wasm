/*
 * sed.c - zsh module that provides a compiled-in `sed` builtin.
 *
 * The actual sed implementation lives in sed-src/ (OpenBSD sed, adapted for
 * embedding).  This file is the thin glue between zsh's module/builtin API
 * and sed_main().
 *
 * Build with:  bin/build --with-sed
 * (sed-src/ object files are compiled separately and injected via LDFLAGS;
 *  -Ised-src is added to CFLAGS so this file can find sed_embed.h.)
 */

#include "sed.mdh"
#include "sed_embed.h"

/**/
static int
bin_sed(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    /* Count args and build argv for sed_main */
    int n = 0;
    char **a;
    for (a = args; *a; a++)
        n++;

    /* Use a VLA; sed args are never more than a few hundred entries */
    char *argv[n + 2];
    argv[0] = "sed";
    for (int i = 0; i < n; i++)
        argv[i + 1] = args[i];
    argv[n + 1] = NULL;

    /* sed_main always exits via sed_do_exit() → longjmp; catch it here */
    if (setjmp(sed_exit_jmp))
        return sed_exit_code;

    sed_main(n + 1, argv);
    /* NOTREACHED — sed_main ends with sed_do_exit(rval) */
    return 0;
}

static struct builtin bintab[] = {
    BUILTIN("sed", 0, bin_sed, 0, -1, 0, NULL, NULL),
};

static struct features module_features = {
    bintab, sizeof(bintab)/sizeof(*bintab),
    NULL, 0,
    NULL, 0,
    NULL, 0,
    0
};

/**/
int
setup_(UNUSED(Module m))
{
    return 0;
}

/**/
int
features_(Module m, char ***features)
{
    *features = featuresarray(m, &module_features);
    return 0;
}

/**/
int
enables_(Module m, int **enables)
{
    return handlefeatures(m, &module_features, enables);
}

/**/
int
boot_(UNUSED(Module m))
{
    return 0;
}

/**/
int
cleanup_(Module m)
{
    return setfeatureenables(m, &module_features, NULL);
}

/**/
int
finish_(UNUSED(Module m))
{
    return 0;
}
