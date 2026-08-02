/* See LICENSE file for copyright and license details. */
#include <unistd.h>

#include <stdio.h>

#include "../util.h"

ssize_t
writeall(int fd, const void *buf, size_t len)
{
	/* zsh-wasm: several tools mix stdio (the "==> file <==" headers printf()s)
	 * with raw writes to fd 1 (the file contents). Whatever is sitting in
	 * stdout's buffer has to go out first, or the headers arrive after the
	 * text they label. Upstream has the same ordering bug whenever stdout is
	 * not a terminal; here stdout is never a terminal. */
	if (fd == 1)
		fflush(stdout);

	const char *p = buf;
	ssize_t n;

	while (len) {
		n = write(fd, p, len);
		if (n <= 0)
			return n;
		p += n;
		len -= n;
	}

	return p - (const char *)buf;
}
