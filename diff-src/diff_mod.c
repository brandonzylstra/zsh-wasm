/*
 * diff_mod.c - zsh module providing a compiled-in `diff` builtin.
 *
 * The implementation is OpenBSD diff, adapted for embedding in diff-src/.
 * This file is the glue between zsh's builtin API and diff's main(), which the
 * build renames to diff_main with -Dmain=diff_main.
 *
 * Build with:  bin/build --with-diff
 *
 * See docs/PLAN.md item 5.
 */

#include "diff.mdh"
#include "diff_embed.h"
#include "embed_stdin.h"

/**/
static int
bin_diff(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    int argument_count = 0;
    char **argument;

    for (argument = args; *argument; argument++)
        argument_count++;

    {
        char *argv[argument_count + 2];
        int index;

        argv[0] = "diff";
        for (index = 0; index < argument_count; index++)
            argv[index + 1] = args[index];
        argv[argument_count + 1] = NULL;

        reset_embedded_stdin();

        /*
         * diff always leaves through diff_do_exit(): its main() ends with
         * exit(status), and usage() and err() exit too.  All of them arrive
         * here.
         */
        if (setjmp(diff_exit_jmp)) {
            fflush(stdout);
            return diff_exit_code;
        }

        diff_main(argument_count + 1, argv);
        /* NOTREACHED */
        fflush(stdout);
        return 0;
    }
}

static struct builtin bintab[] = {
    BUILTIN("diff", 0, bin_diff, 0, -1, 0, NULL, NULL),
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
