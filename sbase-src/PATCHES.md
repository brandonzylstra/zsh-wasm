sbase-src — what was changed and why
====================================

Vendored from [sbase](https://git.suckless.org/sbase) (suckless, MIT — see
`LICENSE`), cloned 2026-08-01. Only the files needed by the sixteen tools we
compile are here — basename, cat, cut, dirname, head, ls, mktemp, printenv,
seq, sort, tail, tee, touch, tr, uniq, wc — plus the `libutil`/`libutf` members
they reach. The hashes, the recursion helpers and the other 90-odd tools were left
behind.

See `docs/PLAN.md` item 6d for why sbase and not BusyBox. Most changes below
exist for one reason: sbase tools are written as *programs* — one per process,
exiting when done — and here they are zsh builtins, entered many times in one
long-lived wasm process that they share with the shell.

Keep this list current. It is what makes a future re-vendor from upstream
tractable.

---

libutil/eprintf.c — fatal errors must not end the process
---------------------------------------------------------

`eprintf()` and `enprintf()` called `exit()`. In a builtin that ends the user's
whole script (and in wasm, the whole module) on something as ordinary as a
missing file. Both now call `sbase_do_exit()`, which longjmps back to the
builtin wrapper in `sbase_mod.c`.

This is two lines because sbase funnels every tool's fatal errors through these
two functions. sed and bc each needed their `exit()` calls found and replaced
one file at a time.

libutil/fshut.c — never close the shell’s own streams
-----------------------------------------------------

`fshut()` ends with `fclose(fp)`, and every tool calls `fshut(stdin, ...)` and
`fshut(stdout, ...)` on the way out. As a program that is correct and the
process is about to end anyway. As a builtin it closes the shell's descriptors:
the first `wc` would take stdout with it, and everything after would have
nowhere to write. `fshut()` now flushes and checks `ferror` as before, then
returns early for `stdin`, `stdout` and `stderr` instead of closing them.

libutil/writeall.c — flush stdio before raw writes to fd 1
----------------------------------------------------------

Several tools mix the two output paths: `tail` prints its `==> name <==` headers
with `printf()` and writes the file contents with `writeall(1, ...)`. Raw writes
bypass stdout's buffer, so the headers arrived *after* the text they label.
`writeall()` now flushes stdout first when the target is fd 1.

Upstream has the same bug whenever stdout is not a terminal — piped
`sbase tail a b` misorders too. Here stdout is never a terminal.

Per-tool state resets
---------------------

wc, sort, tail, uniq, tr, cut, touch and ls keep options and accumulators in
file-scope statics, which a program initializes once. A builtin is entered
repeatedly, so each grew a `reset_state()` called at the top of `main()`.
Without it, `wc a; wc b` reports a running total, a second `cut` inherits the
first one's ranges, and a second `uniq` compares its first line against the
previous call's last.

`sort.c` frees its key definitions rather than dropping them, since `-k` appends
to a list. Its `col1`/`col2` scratch buffers are deliberately *not* freed — they
are reused across calls, and freeing them would trade a leak for churn. `tr.c`
frees its two set tables for the same reason.

basename, cat, dirname, head, mktemp, printenv, seq and tee hold no state
between calls and needed nothing.

sort.c — global modifiers apply to every key
--------------------------------------------

Upstream folds the global flags (`-n`, `-r`, `-f`, …) into a key at the moment
`-k` is parsed, so `sort -k2 -n` sorts key 2 lexically while `sort -n -k2` sorts
it numerically. GNU sort, BSD sort and the zsh shim this replaces all treat the
two spellings alike. After option parsing, the global flags are now OR-ed into
every key definition. `-b` keeps its documented restriction to explicit keys.

head.c — add -c
---------------

sbase's head takes only `-n`/`-NUM`. Both BSD's and GNU's take `-c num` for
bytes, and so did the shim this replaces, along with its tests. Added as
`head_bytes()`, selected by a flag, leaving the line path untouched.

uniq.c — BSD’s count column width
---------------------------------

Upstream prints counts with `%7ld `, matching GNU. BSD uses four columns, which
is what the shim printed and what the rendered examples downstream already show.
Changed to `%4ld `; macOS is this project's reference platform.

---

Not patched, handled in the build instead
-----------------------------------------

- **`main()` renaming.** `bin/build` compiles each tool with
  `-Dmain=<tool>_main`, leaving the source pristine. sbase's own
  `scripts/mkbox` does the same job with `sed`.
- **Symbol collisions with one-true-awk.** `concat` and `runetochar` are defined
  by both. The sbase copies are renamed at compile time with
  `-Dconcat=sbase_concat -Drunetochar=sbase_runetochar`, mirroring how the awk
  objects rename theirs.
- **stdin re-entrancy.** Handled by the shared `embed/embed_stdin.h`, the same
  as sed, awk and bc.
- **Output with no trailing newline.** Not an sbase problem: Emscripten's tty
  hands a line to the print callback only when it sees a newline, so `head -c 5`
  output used to vanish. `web/zsh-worker.js` now flushes libc and the tty after
  every run. The shims hid this by ending everything with `print`.

Known divergences left alone
----------------------------

- `seq -s, 1 4` prints `1,2,3,4` with no trailing separator, which is GNU's
  behavior; BSD appends one. GNU's reading is the more useful of the two.
- Column widths otherwise follow BSD, except `wc`, which stays unpadded — the
  deliberate project convention recorded in `docs/PLAN.md` 1d.
- `ls -l` shows owner and group as numeric `0`. Emscripten has no passwd
  database, so `getpwuid()` returns NULL and sbase falls back to the id, which
  is what `ls -n` prints. Inventing a name would be worse than showing the
  truth: there are no users in a wasm filesystem.
