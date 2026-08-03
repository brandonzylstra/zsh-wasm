diff-src — what was changed and why
===================================

Vendored from [OpenBSD](https://github.com/openbsd/src/tree/master/usr.bin/diff)
on 2026-08-03: `diff.c`, `diffreg.c`, `diffdir.c`, `diff.h`, `xmalloc.c`,
`xmalloc.h`. `diff_embed.[ch]`, `diff_mod.c` and `diff.mdd` are ours and are not
upstream files.

Licensing is not uniform across these files and one clause deserves attention —
see `LICENSE`.

Every change below exists for the same reason: diff is written as a *program*.
It runs once, ends with `exit()`, reports fatal errors with `err()` (which also
exits), and leaves its file-scope state behind because nothing will look at it
again. Here it is a zsh builtin, entered repeatedly inside one long-lived wasm
process it shares with the shell.

Keep this list current. It is what makes a future re-vendor from upstream
tractable.

---

#include <err.h> becomes #include "diff_embed.h"
------------------------------------------------

One line each in `diff.c`, `diffreg.c`, `diffdir.c` and `xmalloc.c`. Emscripten
does ship `<err.h>`, but its `err()` calls `exit()`, which ends the wasm module
and with it the user's session. `diff_embed.h` defines `err`, `errx`, `warn`,
`warnx`, `warnc` and `errc` as macros for replacements that print the same text
and then longjmp back to the builtin wrapper in `diff_mod.c`.

The same header redefines `exit()` to that landing pad, so the `exit(status)`
at the end of `main()` and the `exit(2)` in `usage()` need no edit of their own.
It also stubs `pledge()` and `unveil()` — OpenBSD's, and there is nothing here
to restrict — and supplies `fgetln()`, which is BSD-only, on top of `getline()`.

diff.c — reset the world at the top of main()
---------------------------------------------

`diff_reset_state()` puts every file-scope variable in `diff.c` back to its
initial value and calls `diffreg_reset_state()` for `diffreg.c`'s. Without it
the second `diff` in a script inherits the first one's `-u`, its `-L` labels,
and its accumulated exit status — so a comparison of two identical files would
report them as differing. `optind = 1` goes with it, or the second call skips
its own arguments.

Pointers are freed rather than dropped. A process would be about to exit; this
module outlives the script.

diff.c — the excludes list owns its patterns
--------------------------------------------

`-x pattern` pushes a pointer into `argv`, while `-X file` pushes one that
`read_excludes_file()` allocated. Upstream never frees either, so the mixture
does not matter there. Since the reset above has to free the list, the list now
takes a copy (`xstrdup`) whatever the source, and `read_excludes_file()` frees
the buffer it made.

diff.c — set_argstr() sized its buffer by pointer arithmetic
------------------------------------------------------------

This one was a crash, not a tidy-up. Upstream sizes the `diffargs` string as:

```c
argsize = 4 + *ave - *av + 1;
```

`*av` and `*ave` are the first and last *argument strings*, so this subtracts
one string's address from another's. It gives the combined length of the
arguments only because a process receives them in a single contiguous block.
A builtin gets its arguments from the shell's allocator, wherever it happened
to put them: the difference came out negative, and `xmalloc()` was asked for
4 GB. It now adds up `strlen()`.

diffreg.c — file[] made private, and <time.h> added
---------------------------------------------------

`struct line *file[2]` is a global here and a global in zsh too, so the two
collided at link time. Nothing outside `diffreg.c` refers to it, so it is
renamed to `static_file` with a `#define` keeping the body of the file
unchanged.

`ctime()` is used by the `-c` and `-u` headers; OpenBSD picks it up through
another header, and Emscripten wants `<time.h>` named.

diffreg.c — diffreg_reset_state()
---------------------------------

Two kinds of pointer live at file scope here. `file[0]`/`file[1]` have already
been freed by the time `diffreg()` returns — `class` and `member` are aliases of
them and both are freed after `stone()` — so the reset only drops those. `J`,
`ixold`, `ixnew` and the context vector are the ones `diffreg()` deliberately
reuses across calls by handing the old pointer back to `xreallocarray()`; for a
program comparing a directory tree that is sensible, but here they would be held
for the life of the module, so the reset frees them and the next call starts
from `NULL`.

---

Not patched, handled in the build instead
-----------------------------------------

- **`main()` renaming.** `bin/build` compiles `diff.c` with `-Dmain=diff_main`,
  leaving the source pristine — the same trick used for the sbase tools.
- **`xmalloc` and friends.** one-true-awk defines its own `xmalloc`, and both
  are linked into one binary. diff's are renamed at compile time with
  `-Dxmalloc=diff_xmalloc` and the same for `xcalloc`, `xreallocarray`,
  `xstrdup` and `xasprintf`.
- **stdin re-entrancy.** Handled by the shared `embed/embed_stdin.h`, as for
  sed, awk, bc and the sbase tools.

Known divergences left alone
----------------------------

- `-u` and `-c` stamp the header with each file's modification time, as real
  diff does. In a filesystem that is recreated on every run those timestamps are
  the current time, which makes the output unstable — pass `-L` labels for
  anything that has to be compared.
- Temporary files. `diffreg()` copies a non-seekable input to a file under
  `/tmp` before reading it. MEMFS supports that, and the file is unlinked
  immediately, but it does mean `diff a -` needs `/tmp` to be writable.
