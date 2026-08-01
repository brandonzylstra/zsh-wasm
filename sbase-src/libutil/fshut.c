/* See LICENSE file for copyright and license details. */
#include <stdio.h>
#include <stdlib.h>

#include "../util.h"

int
fshut(FILE *fp, const char *fname)
{
	int ret = 0;

	/* fflush() is undefined for input streams by ISO C,
	 * but not POSIX 2008 if you ignore ISO C overrides.
	 * Leave it unchecked and rely on the following
	 * functions to detect errors.
	 */
	fflush(fp);

	if (ferror(fp) && !ret) {
		weprintf("ferror %s:", fname);
		ret = 1;
	}

	/* zsh-wasm: a tool compiled in as a builtin shares the shell's standard
	 * streams. Closing them here would end the session on the first call,
	 * and every later invocation would have no stdin or stdout. */
	if (fp == stdin || fp == stdout || fp == stderr)
		return ret;

	if (fclose(fp) && !ret) {
		weprintf("fclose %s:", fname);
		ret = 1;
	}

	return ret;
}

void
enfshut(int status, FILE *fp, const char *fname)
{
	if (fshut(fp, fname))
		exit(status);
}

void
efshut(FILE *fp, const char *fname)
{
	enfshut(1, fp, fname);
}
