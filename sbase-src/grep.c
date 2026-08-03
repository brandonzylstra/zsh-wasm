/* See LICENSE file for copyright and license details. */
#include <sys/stat.h>
#include <sys/types.h>

#include <dirent.h>
#include <limits.h>
#include <regex.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>

#include "queue.h"
#include "util.h"

enum { Match = 0, NoMatch = 1, Error = 2 };

static void addpattern(const char *);
static void addpatternfile(FILE *);
static int grepfile(FILE *, const char *);
static int greppath(const char *, int);

static int Eflag;
static int Fflag;
static int Hflag;
static int eflag;
static int fflag;
static int hflag;
static int iflag;
static int oflag;
static int sflag;
static int vflag;
static int wflag;
static int xflag;
static int rflag;               /* 1 = -r, 2 = -R (follow symlinks) */
static long mflag;              /* -m: stop after this many matching lines */
static long aflag;              /* -A: lines of trailing context */
static long bflag;              /* -B: lines of leading context */
static int many;
static int mode;
static int quitearly;           /* -q found its match; stop reading anything */

struct pattern {
	regex_t preg;
	SLIST_ENTRY(pattern) entry;
	char pattern[];
};

static SLIST_HEAD(phead, pattern) phead;

/*
 * A builtin is entered many times in one process, so every static above has to
 * go back to its initial value, and the pattern list from the previous call has
 * to be released -- otherwise the second grep in a script searches for the
 * first one's pattern as well as its own.
 */
static void
reset_state(void)
{
	struct pattern *pnode;

	while (!SLIST_EMPTY(&phead)) {
		pnode = SLIST_FIRST(&phead);
		SLIST_REMOVE_HEAD(&phead, entry);
		if (!Fflag)
			regfree(&pnode->preg);
		free(pnode);
	}
	SLIST_INIT(&phead);

	Eflag = Fflag = Hflag = eflag = fflag = hflag = iflag = 0;
	oflag = sflag = vflag = wflag = xflag = rflag = 0;
	mflag = aflag = bflag = 0;
	many = mode = quitearly = 0;
}

static void
addpattern(const char *pattern)
{
	struct pattern *pnode;
	size_t patlen;

	patlen = strlen(pattern);

	pnode = enmalloc(Error, sizeof(*pnode) + patlen + 1);
	SLIST_INSERT_HEAD(&phead, pnode, entry);
	memcpy(pnode->pattern, pattern, patlen + 1);
}

static void
addpatternfile(FILE *fp)
{
	static char *buf = NULL;
	static size_t size = 0;
	ssize_t len = 0;

	while ((len = getline(&buf, &size, fp)) > 0) {
		if (buf[len - 1] == '\n')
			buf[len - 1] = '\0';
		addpattern(buf);
	}
	if (ferror(fp))
		enprintf(Error, "read error:");
}

/*
 * -w and -x are applied here rather than in addpattern(), so that they hold
 * for patterns given with -e and -f no matter which side of the pattern the
 * flag appears on.  Upstream wraps at parse time, which silently ignores
 * `grep -e foo -w file'.
 */
static char *
wrappattern(const char *pattern)
{
	const char *open = Eflag ? "(" : "\\(";
	const char *close = Eflag ? ")" : "\\)";
	const char *left = xflag ? "^" : "\\<";
	const char *right = xflag ? "$" : "\\>";
	size_t size;
	char *wrapped;

	if (!xflag && !wflag)
		return NULL;

	size = strlen(left) + strlen(open) + strlen(pattern) +
	       strlen(close) + strlen(right) + 1;
	wrapped = enmalloc(Error, size);
	snprintf(wrapped, size, "%s%s%s%s%s", left, open, pattern, close, right);

	return wrapped;
}

static int
linematches(const char *line)
{
	struct pattern *pnode;

	SLIST_FOREACH(pnode, &phead, entry) {
		if (Fflag) {
			if (xflag) {
				if (!(iflag ? strcasecmp : strcmp)(line, pnode->pattern))
					return 1;
			} else {
				if ((iflag ? strcasestr : strstr)(line, pnode->pattern))
					return 1;
			}
		} else {
			if (regexec(&pnode->preg, line, 0, NULL, 0) == 0)
				return 1;
		}
	}
	return 0;
}

/*
 * For -o: the leftmost match at or after `pos', longest if two patterns start
 * in the same place.  Upstream stops at the first pattern that matches
 * anywhere, which is the right answer for a yes/no test and the wrong one when
 * the matched text itself is the output.
 */
static int
nextmatch(const char *line, size_t pos, size_t *start, size_t *end)
{
	struct pattern *pnode;
	size_t beststart = 0, bestend = 0, s, e;
	int found = 0;

	SLIST_FOREACH(pnode, &phead, entry) {
		if (Fflag) {
			const char *hit;

			hit = (iflag ? strcasestr : strstr)(line + pos, pnode->pattern);
			if (!hit)
				continue;
			s = hit - line;
			e = s + strlen(pnode->pattern);
		} else {
			regmatch_t match;

			if (regexec(&pnode->preg, line + pos, 1, &match,
			            pos ? REG_NOTBOL : 0) != 0)
				continue;
			s = pos + match.rm_so;
			e = pos + match.rm_eo;
		}
		if (!found || s < beststart || (s == beststart && e > bestend)) {
			found = 1;
			beststart = s;
			bestend = e;
		}
	}
	*start = beststart;
	*end = bestend;

	return found;
}

/*
 * `sep' is ':' on a selected line and '-' on a context line, which is how GNU
 * grep distinguishes the two when a prefix is printed at all.
 */
static void
printline(const char *str, long n, const char *line, char sep)
{
	if (!hflag && (many || Hflag))
		printf("%s%c", str, sep);
	if (mode == 'n')
		printf("%ld%c", n, sep);
	puts(line);
}

static int
grepfile(FILE *fp, const char *str)
{
	static char *buf = NULL;
	static size_t size = 0;
	ssize_t len = 0;
	long c = 0, n, matched = 0;
	long after = 0, lastprinted = 0;
	int anyprinted = 0;
	char **ringline = NULL;
	long *ringnum = NULL;
	long ringcount = 0, ringnext = 0, i;
	int match, result = NoMatch;
	int context;

	/* -c, -l and -q report about the file, so context has nothing to say. */
	context = (aflag || bflag) && (mode == 0 || mode == 'n');

	if (context && bflag > 0) {
		ringline = encalloc(Error, bflag, sizeof(*ringline));
		ringnum = encalloc(Error, bflag, sizeof(*ringnum));
	}

	for (n = 1; (len = getline(&buf, &size, fp)) > 0; n++) {
		/* Remove the trailing newline if one is present. */
		if (buf[len - 1] == '\n')
			buf[len - 1] = '\0';

		match = linematches(buf);

		if (match != vflag) {
			result = Match;
			matched++;
			switch (mode) {
			case 'c':
				c++;
				break;
			case 'l':
				puts(str);
				goto end;
			case 'q':
				quitearly = 1;
				goto end;
			default:
				if (context) {
					/*
					 * Flush the leading context, then mark
					 * a gap the way GNU grep does.
					 */
					long first = n - ringcount;

					if (anyprinted && first > lastprinted + 1)
						puts("--");
					for (i = 0; i < ringcount; i++) {
						long slot = (ringnext - ringcount + i + bflag) % bflag;

						if (ringnum[slot] <= lastprinted)
							continue;
						printline(str, ringnum[slot], ringline[slot], '-');
						lastprinted = ringnum[slot];
						anyprinted = 1;
					}
					ringcount = 0;
				}
				if (oflag) {
					size_t pos = 0, s, e;

					/* GNU prints nothing for -v -o. */
					if (!vflag) {
						while (nextmatch(buf, pos, &s, &e)) {
							if (e == s) {
								if (buf[s] == '\0')
									break;
								pos = s + 1;
								continue;
							}
							if (!hflag && (many || Hflag))
								printf("%s:", str);
							if (mode == 'n')
								printf("%ld:", n);
							printf("%.*s\n", (int)(e - s), buf + s);
							pos = e;
						}
					}
				} else {
					printline(str, n, buf, ':');
				}
				lastprinted = n;
				anyprinted = 1;
				after = aflag;
				break;
			}
			if (mflag && matched >= mflag)
				goto end;
		} else if (context && after > 0) {
			printline(str, n, buf, '-');
			lastprinted = n;
			anyprinted = 1;
			after--;
		} else if (context && bflag > 0) {
			/* Remember the line in case a match follows it. */
			free(ringline[ringnext]);
			ringline[ringnext] = enstrdup(Error, buf);
			ringnum[ringnext] = n;
			ringnext = (ringnext + 1) % bflag;
			if (ringcount < bflag)
				ringcount++;
		}
	}
	if (mode == 'c')
		printf("%ld\n", c);
end:
	if (ringline) {
		for (i = 0; i < bflag; i++)
			free(ringline[i]);
		free(ringline);
		free(ringnum);
	}
	if (ferror(fp)) {
		weprintf("%s: read error:", str);
		result = Error;
	}
	return result;
}

static int
namecmp(const void *a, const void *b)
{
	return strcmp(*(char *const *)a, *(char *const *)b);
}

/*
 * readdir() order is whatever the filesystem hands back.  Sorting makes the
 * output of `grep -r' reproducible, which matters more here than matching
 * GNU's unordered walk: the same script has to produce the same page every
 * time it is run.
 */
static int
grepdir(const char *path)
{
	struct dirent *dent;
	DIR *dir;
	char **names = NULL, *child;
	size_t count = 0, capacity = 0, i;
	size_t pathlen = strlen(path);
	int result = NoMatch, m;

	if (!(dir = opendir(path))) {
		if (!sflag)
			weprintf("opendir %s:", path);
		return Error;
	}
	while ((dent = readdir(dir))) {
		if (!strcmp(dent->d_name, ".") || !strcmp(dent->d_name, ".."))
			continue;
		if (count == capacity) {
			capacity = capacity ? capacity * 2 : 16;
			names = enreallocarray(Error, names, capacity, sizeof(*names));
		}
		names[count++] = enstrdup(Error, dent->d_name);
	}
	closedir(dir);
	qsort(names, count, sizeof(*names), namecmp);

	for (i = 0; i < count; i++) {
		if (!quitearly) {
			size_t size = pathlen + strlen(names[i]) + 2;

			child = enmalloc(Error, size);
			snprintf(child, size, "%s%s%s", path,
			         (pathlen && path[pathlen - 1] == '/') ? "" : "/",
			         names[i]);
			m = greppath(child, 0);
			free(child);
			if (m == Error || (result != Error && m == Match))
				result = m;
		}
		free(names[i]);
	}
	free(names);

	return result;
}

/*
 * `toplevel' marks a path that came from the command line.  -r follows
 * symlinks there and nowhere else; -R follows them everywhere.
 */
static int
greppath(const char *path, int toplevel)
{
	struct stat st;
	FILE *fp;
	int m;

	if ((rflag == 1 && !toplevel) ? lstat(path, &st) : stat(path, &st)) {
		if (!sflag)
			weprintf("stat %s:", path);
		return Error;
	}
	if (S_ISLNK(st.st_mode))
		return NoMatch;
	if (S_ISDIR(st.st_mode))
		return grepdir(path);

	if (!(fp = fopen(path, "r"))) {
		if (!sflag)
			weprintf("fopen %s:", path);
		return Error;
	}
	m = grepfile(fp, path);
	if (fshut(fp, path))
		m = Error;

	return m;
}

static void
usage(void)
{
	enprintf(Error, "usage: %s [-EFHRchilnoqrsvwx] [-m num] [-A num] "
	         "[-B num] [-C num] [-e pattern] [-f file] "
	         "[pattern] [file ...]\n", argv0);
}

int
main(int argc, char *argv[])
{
	struct pattern *pnode;
	int m = NoMatch, flags = REG_NOSUB, match = NoMatch;
	FILE *fp;
	char *arg, *wrapped;

	reset_state();
	SLIST_INIT(&phead);

	ARGBEGIN {
	case 'E':
		Eflag = 1;
		Fflag = 0;
		flags |= REG_EXTENDED;
		break;
	case 'F':
		Fflag = 1;
		Eflag = 0;
		flags &= ~REG_EXTENDED;
		break;
	case 'H':
		Hflag = 1;
		hflag = 0;
		break;
	case 'R':
		rflag = 2;
		break;
	case 'r':
		rflag = 1;
		break;
	case 'A':
		aflag = enstrtonum(Error, EARGF(usage()), 0, LONG_MAX);
		break;
	case 'B':
		bflag = enstrtonum(Error, EARGF(usage()), 0, LONG_MAX);
		break;
	case 'C':
		aflag = bflag = enstrtonum(Error, EARGF(usage()), 0, LONG_MAX);
		break;
	case 'm':
		mflag = enstrtonum(Error, EARGF(usage()), 0, LONG_MAX);
		break;
	case 'e':
		arg = EARGF(usage());
		if (!(fp = fmemopen(arg, strlen(arg) + 1, "r")))
			eprintf("fmemopen:");
		addpatternfile(fp);
		efshut(fp, arg);
		eflag = 1;
		break;
	case 'f':
		arg = EARGF(usage());
		fp = fopen(arg, "r");
		if (!fp)
			enprintf(Error, "fopen %s:", arg);
		addpatternfile(fp);
		efshut(fp, arg);
		fflag = 1;
		break;
	case 'h':
		hflag = 1;
		Hflag = 0;
		break;
	case 'c':
	case 'l':
	case 'n':
	case 'q':
		mode = ARGC();
		break;
	case 'i':
		flags |= REG_ICASE;
		iflag = 1;
		break;
	case 'o':
		oflag = 1;
		break;
	case 's':
		sflag = 1;
		break;
	case 'v':
		vflag = 1;
		break;
	case 'w':
		wflag = 1;
		break;
	case 'x':
		xflag = 1;
		break;
	default:
		usage();
	} ARGEND

	if (argc == 0 && !eflag && !fflag)
		usage(); /* no pattern */

	/* just add literal pattern to list */
	if (!eflag && !fflag) {
		if (!(fp = fmemopen(argv[0], strlen(argv[0]) + 1, "r")))
			eprintf("fmemopen:");
		addpatternfile(fp);
		efshut(fp, argv[0]);
		argc--;
		argv++;
	}

	/* -o reports where each match is, so the offsets have to be kept. */
	if (oflag)
		flags &= ~REG_NOSUB;

	if (!Fflag) {
		/* Compile regex for all search patterns */
		SLIST_FOREACH(pnode, &phead, entry) {
			wrapped = wrappattern(pnode->pattern);
			enregcomp(Error, &pnode->preg,
			          wrapped ? wrapped : pnode->pattern, flags);
			free(wrapped);
		}
	}

	/* Recursing names more than one file, so label the lines with it. */
	many = (argc > 1) || rflag;

	if (argc == 0) {
		if (rflag)
			match = greppath(".", 1);
		else
			match = grepfile(stdin, "<stdin>");
	} else {
		for (; *argv && !quitearly; argc--, argv++) {
			if (!strcmp(*argv, "-")) {
				m = grepfile(stdin, "<stdin>");
			} else if (rflag) {
				m = greppath(*argv, 1);
			} else if (!(fp = fopen(*argv, "r"))) {
				if (!sflag)
					weprintf("fopen %s:", *argv);
				match = Error;
				continue;
			} else {
				m = grepfile(fp, *argv);
				if (fshut(fp, *argv))
					m = Error;
			}
			if (m == Error || (match != Error && m == Match))
				match = m;
		}
	}

	if (quitearly)
		match = Match;

	if (fshut(stdin, "<stdin>") | fshut(stdout, "<stdout>"))
		match = Error;

	return match;
}
