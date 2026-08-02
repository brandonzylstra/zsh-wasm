/* See LICENSE file for copyright and license details. */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "util.h"

static void
head(FILE *fp, const char *fname, size_t n)
{
	char *buf = NULL;
	size_t i = 0, size = 0;
	ssize_t len;

	while (i < n && (len = getline(&buf, &size, fp)) > 0) {
		fwrite(buf, 1, len, stdout);
		i += (len && (buf[len - 1] == '\n'));
	}
	free(buf);
	if (ferror(fp))
		eprintf("getline %s:", fname);
}

/* zsh-wasm: -c is not in sbase's head, but it is in both BSD's and GNU's, and
 * the shim this replaces had it. See PATCHES.md. */
static void
head_bytes(FILE *fp, const char *fname, size_t n)
{
	size_t i;
	int c;

	for (i = 0; i < n && (c = getc(fp)) != EOF; i++)
		putchar(c);
	if (ferror(fp))
		eprintf("getc %s:", fname);
}

static void
usage(void)
{
	eprintf("usage: %s [-num | -n num | -c num] [file ...]\n", argv0);
}

int
main(int argc, char *argv[])
{
	size_t n = 10;
	FILE *fp;
	int ret = 0, newline = 0, many = 0, bytes = 0;

	ARGBEGIN {
	case 'c':
		bytes = 1;
		n = estrtonum(EARGF(usage()), 0, MIN(LLONG_MAX, SIZE_MAX));
		break;
	case 'n':
		n = estrtonum(EARGF(usage()), 0, MIN(LLONG_MAX, SIZE_MAX));
		break;
	ARGNUM:
		n = ARGNUMF();
		break;
	default:
		usage();
	} ARGEND

	if (!argc) {
		(bytes ? head_bytes : head)(stdin, "<stdin>", n);
	} else {
		many = argc > 1;
		for (newline = 0; *argv; argc--, argv++) {
			if (!strcmp(*argv, "-")) {
				*argv = "<stdin>";
				fp = stdin;
			} else if (!(fp = fopen(*argv, "r"))) {
				weprintf("fopen %s:", *argv);
				ret = 1;
				continue;
			}
			if (many) {
				if (newline)
					putchar('\n');
				printf("==> %s <==\n", *argv);
			}
			newline = 1;
			(bytes ? head_bytes : head)(fp, *argv, n);
			if (fp != stdin && fshut(fp, *argv))
				ret = 1;
		}
	}

	ret |= fshut(stdin, "<stdin>") | fshut(stdout, "<stdout>");

	return ret;
}
