/*
 * awk_mod.c - zsh module that provides a compiled-in `awk` builtin.
 *
 * The actual awk implementation is one-true-awk (BWK awk, Lucent license),
 * adapted for embedding in awk-src/.  This file is the thin glue between
 * zsh's module/builtin API and awk_main().
 *
 * Build with:  bin/build --with-awk
 */

#include "awk.mdh"
#include "awk_embed.h"

/**/
static int
bin_awk(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    int n = 0;
    char **a;
    for (a = args; *a; a++)
        n++;

    char *argv[n + 2];
    argv[0] = "awk";
    for (int i = 0; i < n; i++)
        argv[i + 1] = args[i];
    argv[n + 1] = NULL;

    if (setjmp(awk_exit_jmp))
        return awk_exit_code;

    return awk_main(n + 1, argv);
}

static struct builtin bintab[] = {
    BUILTIN("awk", 0, bin_awk, 0, -1, 0, NULL, NULL),
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
