sbase-src — what was changed and why
====================================

Vendored from [sbase](https://git.suckless.org/sbase) (suckless, MIT — see
`LICENSE`), cloned 2026-08-01. Only the files needed by `wc`, `sort` and `cut`
are here; the hashes, the recursion helpers and the other 90-odd tools were left
behind.

This is the spike described in `docs/PLAN.md` item 6d. Every change below exists
for the same reason: sbase tools are written as *programs* — one per process,
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

wc.c, sort.c, cut.c — reset file-scope state per call
-----------------------------------------------------

Each tool keeps its options and accumulators in file-scope statics, which a
program initializes once. A builtin is entered repeatedly, so each tool grew a
`reset_state()` called at the top of `main()`. Without it, `wc a; wc b` would
report a running total, and a second `cut` would inherit the first one's ranges.

`sort.c` frees its key definitions rather than dropping them, since `-k` appends
to a list. Its `col1`/`col2` scratch buffers are deliberately *not* freed — they
are reused across calls, and freeing them would trade a leak for churn.

sort.c — global modifiers apply to every key
--------------------------------------------

Upstream folds the global flags (`-n`, `-r`, `-f`, …) into a key at the moment
`-k` is parsed, so `sort -k2 -n` sorts key 2 lexically while `sort -n -k2` sorts
it numerically. GNU sort, BSD sort and the zsh shim this replaces all treat the
two spellings alike. After option parsing, the global flags are now OR-ed into
every key definition. `-b` keeps its documented restriction to explicit keys.

This was the only behavioral divergence the 296-case suite found.

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
