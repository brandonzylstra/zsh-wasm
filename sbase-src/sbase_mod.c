/*
 * sbase_mod.c - zsh module providing compiled-in wc, sort and cut builtins.
 *
 * The implementations are sbase (suckless, MIT), adapted for embedding in
 * sbase-src/. This file is the glue between zsh's builtin API and each tool's
 * main(), which the build renames to <tool>_main with -Dmain=<tool>_main.
 *
 * Build with:  bin/build --with-sbase
 *
 * This is the spike described in docs/PLAN.md item 6d: three commands, chosen
 * because their zsh-function shims all produced wrong answers, compiled in to
 * find out what replacing the whole preamble would cost.
 */

#include "sbase.mdh"
#include "sbase_embed.h"
#include "embed_stdin.h"

/*
 * Shared by all three builtins: build argv, reset the stdin FILE that every
 * invocation inherits, then run the tool with a landing pad for its exit().
 */
static int
run_sbase_tool(const char *name, char **args, int (*tool_main)(int, char **))
{
    int argument_count = 0;
    char **argument;

    for (argument = args; *argument; argument++)
        argument_count++;

    {
        char *argv[argument_count + 2];
        int index;

        argv[0] = (char *)name;
        for (index = 0; index < argument_count; index++)
            argv[index + 1] = args[index];
        argv[argument_count + 1] = NULL;

        reset_embedded_stdin();

        if (setjmp(sbase_exit_jmp)) {
            fflush(stdout);
            return sbase_exit_code;
        }

        {
            int status = tool_main(argument_count + 1, argv);

            fflush(stdout);
            return status;
        }
    }
}

/*
 * Which builtins exist follows the tool list the build compiled
 * (SBASE_TOOLS in bin/build), so a subset can be built -- which is how the
 * per-tool size cost in docs/PLAN.md was measured.
 */

#ifdef SBASE_HAVE_BASENAME
/**/
static int
bin_sbase_basename(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("basename", args, basename_main);
}
#endif

#ifdef SBASE_HAVE_CAT
/**/
static int
bin_sbase_cat(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("cat", args, cat_main);
}
#endif

#ifdef SBASE_HAVE_CUT
/**/
static int
bin_sbase_cut(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("cut", args, cut_main);
}
#endif

#ifdef SBASE_HAVE_DIRNAME
/**/
static int
bin_sbase_dirname(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("dirname", args, dirname_main);
}
#endif

#ifdef SBASE_HAVE_GREP
/**/
static int
bin_sbase_grep(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("grep", args, grep_main);
}
#endif

#ifdef SBASE_HAVE_HEAD
/**/
static int
bin_sbase_head(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("head", args, head_main);
}
#endif

#ifdef SBASE_HAVE_LS
/**/
static int
bin_sbase_ls(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("ls", args, ls_main);
}
#endif

#ifdef SBASE_HAVE_MKTEMP
/**/
static int
bin_sbase_mktemp(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("mktemp", args, mktemp_main);
}
#endif

#ifdef SBASE_HAVE_PRINTENV
/**/
static int
bin_sbase_printenv(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("printenv", args, printenv_main);
}
#endif

#ifdef SBASE_HAVE_SEQ
/**/
static int
bin_sbase_seq(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("seq", args, seq_main);
}
#endif

#ifdef SBASE_HAVE_SORT
/**/
static int
bin_sbase_sort(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("sort", args, sort_main);
}
#endif

#ifdef SBASE_HAVE_TAIL
/**/
static int
bin_sbase_tail(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("tail", args, tail_main);
}
#endif

#ifdef SBASE_HAVE_TEE
/**/
static int
bin_sbase_tee(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("tee", args, tee_main);
}
#endif

#ifdef SBASE_HAVE_TOUCH
/**/
static int
bin_sbase_touch(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("touch", args, touch_main);
}
#endif

#ifdef SBASE_HAVE_TR
/**/
static int
bin_sbase_tr(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("tr", args, tr_main);
}
#endif

#ifdef SBASE_HAVE_UNIQ
/**/
static int
bin_sbase_uniq(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("uniq", args, uniq_main);
}
#endif

#ifdef SBASE_HAVE_WC
/**/
static int
bin_sbase_wc(UNUSED(char *name), char **args, UNUSED(Options ops), UNUSED(int func))
{
    return run_sbase_tool("wc", args, wc_main);
}
#endif

/* Keep this table sorted by name -- zsh requires it. */
static struct builtin bintab[] = {
#ifdef SBASE_HAVE_BASENAME
    BUILTIN("basename", 0, bin_sbase_basename, 0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_CAT
    BUILTIN("cat",      0, bin_sbase_cat,      0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_CUT
    BUILTIN("cut",      0, bin_sbase_cut,      0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_DIRNAME
    BUILTIN("dirname",  0, bin_sbase_dirname,  0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_GREP
    BUILTIN("grep",     0, bin_sbase_grep,     0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_HEAD
    BUILTIN("head",     0, bin_sbase_head,     0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_LS
    BUILTIN("ls",      0, bin_sbase_ls,      0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_MKTEMP
    BUILTIN("mktemp",   0, bin_sbase_mktemp,   0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_PRINTENV
    BUILTIN("printenv", 0, bin_sbase_printenv, 0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_SEQ
    BUILTIN("seq",      0, bin_sbase_seq,      0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_SORT
    BUILTIN("sort",     0, bin_sbase_sort,     0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_TAIL
    BUILTIN("tail",     0, bin_sbase_tail,     0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_TEE
    BUILTIN("tee",      0, bin_sbase_tee,      0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_TOUCH
    BUILTIN("touch",    0, bin_sbase_touch,    0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_TR
    BUILTIN("tr",       0, bin_sbase_tr,       0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_UNIQ
    BUILTIN("uniq",     0, bin_sbase_uniq,     0, -1, 0, NULL, NULL),
#endif
#ifdef SBASE_HAVE_WC
    BUILTIN("wc",       0, bin_sbase_wc,       0, -1, 0, NULL, NULL),
#endif
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
