/*
 * bc_mod.c - zsh module that provides a compiled-in `bc` builtin.
 *
 * The actual bc implementation is Gavin Howard's bc (BSD-2-Clause license),
 * adapted for embedding in bc-src/.  This file is the thin glue between
 * zsh's module/builtin API and bc_embed_main().
 *
 * Build with:  bin/build --with-bc
 */

#include "bc.mdh"
#include "bc_embed.h"

/**/
static int
bin_bc(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    int n = 0;
    char **a;
    for (a = args; *a; a++)
        n++;

    const char *argv[n + 2];
    argv[0] = "bc";
    for (int i = 0; i < n; i++)
        argv[i + 1] = args[i];
    argv[n + 1] = NULL;

    if (setjmp(bc_exit_jmp)) {
        fflush(stdout);
        return bc_exit_code;
    }

    int ret = bc_embed_main(n + 1, argv);
    fflush(stdout);
    return ret;
}

static struct builtin bintab[] = {
    BUILTIN("bc", 0, bin_bc, 0, -1, 0, NULL, NULL),
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
