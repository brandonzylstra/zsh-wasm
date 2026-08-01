### 1d. stdin/pipe correctness in the coreutils shims ✓ done

Found while diffing every shim against real zsh 5.9 rather than only running the
existing tests. Four bugs, all invisible to the suite because **every shim test
used FILE arguments** — and `$(<file)` strips trailing newlines while
`IFS= read -r -d ''` does not.

1. **The phantom empty element.** Splitting newline-terminated stdin with
   `${(@f)…}` yields a trailing empty element. That one defect produced three
   different symptoms: `sort` emitted a leading blank line, `tail -n N` returned
   N-1 real lines, and `head -n N` *after a sort* consumed the blank as a line.
   Fixed by stripping the trailing newline at all five line-splitting stdin
   reads (head, tail, grep, sort, uniq), matching what `wc` and `base64`
   already did.
2. **`uniq` discarded every flag.** `-c` silently behaved as a plain `uniq`, so
   the counts just vanished. Now supports `-c`, `-d` and `-u`.
3. **`cut` had no stdin branch at all** — it looped over file operands only, so
   any piped `cut` produced *no output whatsoever*.

The one piped `sort | head` test that did exist used `printf 'c\na\nb'` with no
trailing newline, which is precisely how it dodged the bug for so long.

12 stdin/pipe regression tests added to `web/test.html`; 9 of them fail against
the unpatched runtime.

**Known, deliberate divergence:** `wc` prints unpadded counts (`3`), where BSD
`wc` pads to a column (`       3`). The existing tests encode the unpadded form
as the project convention, and GNU `wc` agrees with it, so this was left alone.

Project Plan — Beyond the Current Build
=======================================

This document covers planned and proposed work beyond the npm publishing
checklist (see `docs/NPM.md`). Items are ordered roughly by priority / effort
ratio. Each section includes a checklist, implementation notes, and known
obstacles.

---

1. Quick Wins
-------------

Small changes, high impact. Each of these removes a `knownFail` test or fixes a
silent limitation.

### 1a. `zsh/mathfunc` — add to static build ✓ done

**Status:** Complete. `mathfunc` added to the static build in `bin/build` and
`bin/setup`. `zsh-mathfunc` test promoted from `knownFail` to passing.

**Checklist:**
- [x] Add `mathfunc` to the `sed` expression in `bin/build` that flips
      `files|stat|regex` to `link=static`
- [x] Same for `bin/setup` (so fresh setup builds include it)
- [x] Rebuild wasm
- [x] Promote `zsh-mathfunc` from `knownFail` to a passing test
- [x] Update README shim table / capability notes

**Code change — `bin/build`** (line that currently reads `files|stat|regex`):

```bash
# Before:
-e 's/^(name=zsh\/(files|stat|regex) .*)link=no/\1link=static/' \
-e 's/^(name=zsh\/(files|stat|regex) .*)load=no/\1load=yes/' \

# After:
-e 's/^(name=zsh\/(files|stat|regex|mathfunc) .*)link=no/\1link=static/' \
-e 's/^(name=zsh\/(files|stat|regex|mathfunc) .*)load=no/\1load=yes/' \
```

Same pattern in `bin/setup`.

**Obstacles:** None known. `mathfunc.c` is a pure C module with no platform
dependencies (uses `<math.h>`). Emscripten's musl provides `libm`.

---

### 1b. grep shim — add stdin support ✓ done

**Status:** Complete. grep shim reads stdin when called with no file args.
`grep-stdin` promoted from `knownFail` to passing test. All locals moved to
function top to avoid the zsh-wasm local-in-loop stdout bug.

**Checklist:**
- [x] Drain stdin when no file args are present
- [x] Remove `grep-stdin` from `knownFail`
- [x] Add test: `grep hello <<< 'hello world'`

**Code change — `web/zsh-runtime.js`** (the `grep()` function):

```zsh
grep() {
  local _gi=0 _gv=0 _gn=0 _gc=0
  while [[ ${1-} == -* ]]; do
    [[ $1 == *i* ]] && _gi=1
    [[ $1 == *v* ]] && _gv=1
    [[ $1 == *n* ]] && _gn=1
    [[ $1 == *c* ]] && _gc=1
    shift
  done
  local pat=$1; shift
  local f line _cnt _num _hit
  local -a lines
  _process_lines() {
    _cnt=0 _num=0
    for line in "${(@)lines}"; do
      (( _num++ ))
      _hit=0
      if (( _gi )); then [[ ${line:l} =~ ${pat:l} ]] && _hit=1
      else               [[ $line =~ $pat ]]           && _hit=1
      fi
      (( _gv )) && (( _hit = !_hit ))
      if (( _hit )); then
        (( _cnt++ ))
        if (( !_gc )); then
          (( _gn )) && print -- "$_num:$line" || print -- "$line"
        fi
      fi
    done
    (( _gc )) && print -- $_cnt
  }
  if (( $# )); then
    for f; do
      lines=("${(@f)$(<$f)}")
      _process_lines
    done
  else
    local _stdin
    IFS= read -r -d '' _stdin
    lines=("${(@f)_stdin}")
    _process_lines
  fi
}
```

**Obstacles:** `_process_lines` as a nested function requires zsh to allow inner
function definitions — which it does. Alternatively, just inline it twice (less
elegant but avoids any nesting edge cases). Multi-file mode with stdin mixing
(`grep pat - file`) is an edge case we can ignore for now.

---

### 1c. `wc` and `cat` stdin support ✓ done

**Status:** Complete. Both shims drain stdin when called with no file args.
`cat-stdin` and `wc-stdin` tests added and passing. wc strips trailing newline
from stdin content (matching `$(<file)` behavior) to avoid off-by-one in
line counting.

**Checklist:**
- [x] `cat` with no args: drain stdin and print it
- [x] `wc` with no args: count lines/words/bytes of stdin
- [x] Add tests for both
- [x] Confirm `cat <<< "hello"` and `wc -l <<< 'hello world'` pass

**Code change — `cat`:**

```zsh
cat() {
  if (( $# )); then
    local f; for f; do print -r -- "$(<$f)"; done
  else
    local _c; IFS= read -r -d '' _c; print -rn -- "$_c"
  fi
}
```

**Code change — `wc`:** Add a stdin branch when `$args` is empty; compute stats
from `IFS= read -r -d '' content` instead of `$(<$f)`.

---

1g. `tail -n +N` and `sort -t` (done)
--------------------------------------

Both found by writing one ordinary CSV script against the new pipeline support,
which is a fair comment on how much the shims had been exercised by realistic
input rather than by targeted tests.

- `tail -n +N` (start at line N — how a header line gets dropped) was read as
  "last N lines", so `tail -n +2 file | wc -l` on a 6-line CSV answered 2.
- `tail` with a count larger than the input printed *nothing*: the negative
  slice `\${lines[-10,-1]}` is out of range on a 4-line file, and zsh expands
  out-of-range slices to nothing. Plain `tail file` on any file under 10 lines
  was therefore empty. The start index is now clamped.
- `sort -t DELIM` was not supported at all, so `sort -t, -k3` fell back to
  whitespace splitting and sorted by a field that did not exist — a wrong
  answer rather than an error. `-t` and `-k` are now parsed before the
  combinable flag letters, so the delimiter of `sort -tn` is not mistaken for a
  request for numeric sort.

Tests: `tail-from-line`, `tail-from-line-stdin`, `tail-from-line-past-end`,
`tail-default-short-file`, `tail-count-over-length`, `tail-bytes-over-length`,
`head-count-over-length`, `sort-field-separator`,
`sort-field-separator-detached`, `sort-separator-not-a-flag`.

---

1f. Empty input produced a line that was not there (done)
----------------------------------------------------------

Same family as 1d, and the one it missed. `${(@f)text}` splits the empty string
into one empty element, so with empty input `sort`, `uniq`, `head`, `tail`,
`cut` and `grep` each printed a stray newline, and `wc -l` counted that phantom
line: `printf '' | wc -l` said 1, as did `wc -l` on an empty file.

Pipelines make empty input ordinary — `grep pattern file | sort | uniq` on no
matches — so this went from obscure to routine.

- `_zw_split_lines ARRAY TEXT` is now the single place that turns text into an
  array of lines. It handles both phantom cases (empty string, trailing
  newline), and all 11 split sites call it.
- `head`/`tail` additionally guard their output: `print -l --` with an empty
  list still prints one empty line.
- `wc -c` on stdin was off by one in the other direction: it counted the content
  *after* the trailing newline was stripped for line counting. Bytes now come
  from the raw input, lines and words from the stripped copy.

Tests: `empty-input-wc`, `empty-input-no-blank-line`, `empty-line-preserved`,
`wc-stdin-byte-count`.

---

1e. `setopt errexit` compatibility in the shims (done)
------------------------------------------------------

Found while sweeping for pipeline regressions, but pre-existing and unrelated to
pipelines: under `setopt errexit` (`set -e`) — which real scripts use constantly —
most shims took the whole script down. Three separate causes:

1. `IFS= read -r -d '' var` never finds its NUL delimiter in text input, so it
   returns 1 at EOF. Every stdin-reading shim did this. Now `|| true`.
2. A shim's internal `(( flag )) && ...` test returning false is a failed command
   as far as errexit is concerned, and there are hundreds of them. Each shim now
   opens with `setopt localoptions noerrexit`, which shields its internals and is
   undone on return, leaving the shim's own exit status to speak for it.
3. `env` with no command returned the status of the last `[[ ]]` in its loop
   rather than its own success. Now `return 0`.

Also fixed alongside: the `ln` shim called `zf_symlink`, which does not merely
fail in this build — it ends the script, with no message. `zf_ln -s` does the
same job correctly, and `-f` is now passed through instead of parsed and dropped.

Tests: `errexit-shims`, `errexit-stdin-shims`, `errexit-pipeline`,
`shim-exit-status`, `ln-symlink`, `ln-symlink-force`.

---

2. Compiled grep (--with-grep)
------------------------------

**Status:** Planned. The grep shim covers the most common cases but has hard
limits: no `-A`/`-B`/`-C` context lines, no `-r`/`-R` recursive (already
handled by zsh globs), no `-w` word-boundary, no `-l` list-filenames, no `-m`
max-count, and the ERE implementation relies on zsh's `=~` which may differ
subtly from a real POSIX regex engine.

Compiling a real grep eliminates all of these. It also enables stdin reading
natively (no shim workaround needed).

**Source:** OpenBSD grep. Clean POSIX C, BSD-2-Clause license, ~2.5 KLOC.
Available at:
- `https://github.com/clibs/grep` (mirror)
- OpenBSD CVS: `src/usr.bin/grep/`

OpenBSD grep files needed: `grep.c`, `grep.h`, `file.c`, `queue.c`,
`util.c` + generated `ohcount` (~5 .c files total).

**Checklist:**
- [ ] Download OpenBSD grep source into `grep-src/`
- [ ] Audit `grep.c` for `exit()` calls → replace with `longjmp`-based
      `grep_do_exit()` (same pattern as `sed_do_exit()`)
- [ ] Create `grep_embed.h` / `grep_embed.c` (reset globals between calls)
- [ ] Create `grep_mod.c` (zsh builtin glue, same structure as `sed_mod.c`)
- [ ] Create `grep-src/grep.mdd` (zsh module descriptor)
- [ ] Add `--with-grep` flag to `bin/build`; compile grep objects and inject
      via `LDFLAGS` at link time (same as sed/awk)
- [ ] Add grep to the `config.modules` patching block
- [ ] Write a `sed-src/grep.mdd` (or create a `grep.mdd` outside the zsh tree)
- [ ] Rebuild wasm with `--with-grep`
- [ ] Remove grep shim from `BUILTINS_PREAMBLE` (or keep it as a fallback for
      builds without `--with-grep` — better)
- [ ] Promote `grep-context` from `knownFail`; add tests for `-A`/`-B`/`-C`,
      `-w`, `-l`, `-r` (if recursive makes sense in memfs)
- [ ] Update README and ROADMAP

**Key embedding changes (same pattern as sed):**

```c
// grep_embed.h
jmp_buf grep_exit_jmp;
int     grep_exit_code;
void    grep_do_exit(int code);
void    grep_full_reset(void);  // clear file list, stats, etc.
int     grep_main(int argc, char **argv);

// In grep.c: replace every exit(n) with grep_do_exit(n)
// Add grep_full_reset() that zeroes all file-scope statics
```

```c
// grep_mod.c
static int bin_grep(char *name, char **args, Options ops, int func) {
    // build argv[], call grep_main(), same as bin_sed / bin_awk
    if (setjmp(grep_exit_jmp)) {
        fflush(stdout);
        return grep_exit_code;
    }
    int ret = grep_main(argc, argv);
    fflush(stdout);
    return ret;
}
```

**Obstacles:**

1. **stdin in wasm context**: OpenBSD grep reads from stdin for `-` or when no
   files given. In the wasm worker, stdin is set up via `Module.stdin` callback
   byte-by-byte. Grep's `fgetc(stdin)` should work, but needs testing.
2. **`mmap`**: Some grep implementations use `mmap` for performance. Emscripten
   supports `mmap` on its virtual filesystem, so this is likely fine.
3. **Global state audit**: grep has file-level statics for match counts, options,
   the compiled regex. All must be reset in `grep_full_reset()`.
4. **`-r`/`-R` recursive**: Recursion uses `opendir`/`readdir`. These work in
   Emscripten's memfs. Worth testing.

**Size impact estimate:** ~30–50 KB added to wasm binary (similar to sed).

---

3. Compiled bc ✓ done
---------------------

**Status:** Complete. Gavin Howard's bc v7.0.3 (BSD-2-Clause) compiled into
the wasm binary as a zsh builtin via `bin/build --with-bc`. Tests: bc-basic,
bc-scale, bc-sqrt, bc-func, bc-heredoc all pass.

**Source:** Gavin Howard's bc — the implementation that ships with macOS 14+
and many BSDs. BSD-2-Clause license (not MIT as initially noted), ~12 KLOC
of portable C. No yacc/flex, explicitly designed for portability.

**Checklist:**
- [x] Download Gavin Howard bc source into `bc-7.0.3/` (tag v7.0.3)
- [x] Build it natively to understand the build system
- [x] Rename `main()` to `bc_embed_main()` in main.c
- [x] Replace 5 `exit()` calls in vm.c and file.c with `bc_do_exit()` + longjmp
- [x] Create `bc_embed.h` / `bc_embed.c`
- [x] Create `bc_mod.c` (zsh builtin glue)
- [x] Create `bc.mdd`
- [x] Add `--with-bc` flag to `bin/build` (includes strgen native compilation
      and generation of bc_help.c, dc_help.c, bc_lib.c from gen/ sources)
- [x] Rebuild; test `bc <<< 'scale=4; 22/7'` → `3.1428`
- [x] Add 5 tests: bc-basic, bc-scale, bc-sqrt, bc-func, bc-heredoc
- [x] Update README and ROADMAP

**Key implementation notes:**
- bc requires `BC_ENABLED=1 DC_ENABLED=1` as explicit defines (not set by
  default in individual source files — normally set by bc's own build system)
- bc requires a native code generator (`gen/strgen.c`) to produce `bc_help.c`,
  `dc_help.c`, and `bc_lib.c` from text/script sources; `bin/build --with-bc`
  compiles and runs strgen automatically
- `BC_ENABLE_EXTRA_MATH=0` disables the `rand()`/`irand()` extension that
  reads `/dev/urandom` — removes a wasm compatibility risk
- A fresh Worker per `runZshScript()` call resets bc global state (`vm_data`)
  *across* runs — but a single script may invoke `bc` more than once, and those
  invocations share one process. Without a reset, the 2nd `bc` call inherited
  stale `vm_data` and hung. Fixed by `memset(&vm_data, 0, sizeof(vm_data))` at
  the top of `bc_embed_main()` (bc-src/main.c). awk needed the analogous fix:
  reset `beginloc`/`endloc` (BEGIN/END action lists that accumulate per parse)
  and `argno`/`infile` (input cursor) in `awk_main()`.
- Known remaining limitation: the compiled awk mangles multibyte characters
  (e.g. `→`) because the wasm locale is `C` (`MB_CUR_MAX == 1`). Use ASCII in
  awk programs, or teach awk UTF-8 awareness (future work).

**Obstacles:**

1. **stdin**: `echo "1+1" | bc` requires a working pipe, which we can't do
   without fork. The workaround: pass the expression via a temp file or here
   string:
   ```sh
   bc <<< "scale=2; 22/7"     # works — here string uses temp file
   bc << 'EOF'                 # works — heredoc uses temp file
   scale=2; 22/7
   EOF
   ```
   Pipe-based usage (`echo expr | bc`) is the most common idiom in scripts —
   this will be a visible limitation. Document it clearly.

2. **Global state**: bc has a VM with heap, stack, and compiled program state.
   `bc_full_reset()` will need to free the VM and reinitialize. The Gavin Howard
   source has a `bc_program_reset()` and `bc_vm_shutdown()` — use these.

3. **`dc` support**: gh-bc optionally includes `dc`. Safe to disable for now
   (`BC_ENABLE_DC=0`) and add later if needed.

4. **Build system**: gh-bc uses its own configure/Makefile, not autotools.
   Will need to adapt the compilation into individual `emcc` calls (same pattern
   as awk: compile each `.c` separately, then link into the zsh binary).

**Size impact estimate:** ~60–100 KB added to wasm binary.

---

4. find shim
------------

**Status:** Complete. Shim in `BUILTINS_PREAMBLE` in `web/zsh-runtime.js`.

**Checklist:**
- [x] Implement `find DIR -name PATTERN [-type f|d/l]` → zsh glob
- [x] Implement `find DIR -maxdepth N`
- [x] Implement `find DIR -newer FILE` (uses `zstat` mtime comparison; untested —
      wasm memfs doesn't allow setting mtimes so a reliable test isn't feasible)
- [x] Add tests: find-basic, find-name, find-type-f, find-type-d, find-maxdepth,
      find-maxdepth0, find-name-type (7 tests; 171/174 passing)
- [x] Document which `find` flags are unsupported (README shim table)

**Key implementation notes:**
- Two-phase arg parsing: leading non-`-` args are start paths, then options
- Start dir is prepended manually (`_items=($_d $_d/**/*(ND))`) since `**/*` doesn't include the root
- Depth counted with `_parts=(${(s:/:)_rel}); _depth=${#_parts}` — nested `${#${...//...}}` inside `$((...))` silently misbehaves in this wasm zsh build
- All locals declared at function top (avoids the zsh-wasm local-in-loop stdout bug)
- Known limitation: `-name` patterns don't match dotfiles unless the pattern starts with `.` (zsh `[[ x == pat ]]` doesn't match dotfiles with `*`)

**Core implementation:**

```zsh
find() {
  local dir='.' type_flag='' name_pat='' maxdepth=999
  local -a paths
  while (( $# )); do
    case $1 in
      -name)      shift; name_pat=$1 ;;
      -type)      shift; type_flag=$1 ;;
      -maxdepth)  shift; maxdepth=$1 ;;
      -*)         ;;   # ignore unsupported flags
      *)          [[ -z $dir || $dir == '.' ]] && dir=$1 || paths+=($1) ;;
    esac
    shift
  done
  local glob qualifier=''
  [[ $type_flag == 'f' ]] && qualifier='.'
  [[ $type_flag == 'd' ]] && qualifier='/'
  # Build glob pattern
  local -a results
  if [[ -n $name_pat ]]; then
    # Convert find's glob (-name '*.sh') to zsh glob
    results=($dir/**/${~name_pat}(N${qualifier}))
  else
    results=($dir/**/*(N${qualifier}))
  fi
  # Apply maxdepth (count slashes in path relative to dir)
  local f
  for f in $results; do
    local rel=${f#$dir/}
    local depth=$(( ${#rel//[^\/]} + 1 ))
    (( depth <= maxdepth )) && print -- $f
  done
}
```

**Obstacles:**

1. **`-exec`**: This requires forking an external process. Could support a
   limited form for zsh builtins: `-exec echo {} \;` → just print. Skip for now.
2. **`-mtime`/`-newer`**: Doable with `zstat` but requires careful arithmetic.
3. **Multiple start paths**: `find dir1 dir2 -name '*.sh'` — need to handle the
   case where multiple positional args are directories.
4. **Glob-to-find translation**: `-name '*.sh'` must become `**/*.sh` and
   `-name 'foo'` must become `**/foo`. The `${~name_pat}` zsh idiom handles
   glob expansion of the pattern variable.

---

5. Compiled diff (--with-diff)
------------------------------

**Status:** Possible. Not yet started. Lower priority than grep/bc.

**Source:** OpenBSD diff. ~4 KLOC of C, BSD license. Reads two files and
outputs a unified or context diff.

**Checklist:**
- [ ] (same embedding checklist as grep/sed/bc)
- [ ] Confirm `diff /tmp/a.txt /tmp/b.txt` produces correct unified output
- [ ] Add tests: identical files, insertions, deletions
- [ ] Update README/ROADMAP

**Obstacles:** diff uses `tmp` files internally for some diff algorithms.
Emscripten's memfs supports temp file creation. The main risk is memory
allocation for large file diffs, which is not a concern for typical script use.

---

6. Pipelines without fork() (done)
----------------------------------

**Status:** Complete, via Option E below. `echo hello | grep hello` works, and
so does `echo '1+1' | bc`. `simulatePipes()` has been deleted from
`web/zsh-runtime.js` along with the `fork` run option (kept in `index.d.ts` as
deprecated and ignored so existing TypeScript callers still compile).

What was done:

- `bin/setup` now patches four more places in `Src/exec.c` under
  `#ifdef __EMSCRIPTEN__` (the two `$( )` patches were already there):
  1. `zfork()` records `zsh_wasm_nofork` when `fork()` fails with `ENOSYS`, so
     the fallbacks below fire only for a genuinely missing `fork()`.
  2. Both `execcmd_fork()` call sites in `execcmd_exec()` fall back to running
     the command in this shell instead of taking the fatal error path. The
     existing `addfd()`/`fixfds()` save-and-restore already handles fds 0 and 1,
     so the pipeline redirection does not escape the command. The late call site
     only does this for something with an in-process form (a builtin, function
     or `( )`); a real external command still fails.
  3. `execpline2()` links the stages with a temp file instead of a pipe.
- **A temp file, not a pipe.** Emscripten's `pipe()` never reports end-of-file:
  a drained pipe returns `EAGAIN` even after the write end is closed
  (see `libpipefs.js` — `read()` throws `EAGAIN` whenever the buffer is empty,
  and `close()` only decrements a refcount). A stage reading a finished pipe
  would hang or error instead of seeing EOF. A temp file is also unbounded,
  which removes the pipe-buffer deadlock the `$( )` patch has to warn about.
- **Compiled tools had to be made re-entrant on stdin** (see 6b below).

**Accepted trade-offs**, all documented in the README:

- No isolation between stages: `echo x | read value` leaves `value` set in the
  script, and `exit` in a stage ends the whole script.
- No streaming: each stage finishes before the next starts, so `cmd | head -1`
  still runs `cmd` to completion.
- `pipestatus` reflects only the stages that produce a real job entry.
- `cmd &` no longer aborts the script; it runs `cmd` synchronously (an
  improvement on the previous behavior, but still not backgrounding).

Tests: 20 pipeline cases in `web/test.html` (`pipe-*`), covering multi-stage
chains, `|&`, exit status, `while read`, pipelines inside `$( )`/functions/
subshells, output larger than any pipe buffer, and repeated invocations of the
compiled sed/awk/bc from a pipe.

---

6b. Compiled tools reading stdin more than once (done)
------------------------------------------------------

**Status:** Complete. Found while testing pipelines, but it was a pre-existing
bug: `sed s/a/b/ <<< a; sed s/c/d/ <<< c` printed only `b`.

`sed`, `awk` and `bc` are builtins, not processes, so they share one `stdin`
FILE for the life of the wasm module even though fd 0 is a different file on
every call. The end-of-file flag left by the first call made the second read
nothing at all — `getc()` reported EOF from the flag without ever touching the
new descriptor.

- `embed/embed_stdin.h` — `reset_embedded_stdin()`, called at the top of each
  builtin: `fflush(stdin)` to drop stale buffered input, `clearerr(stdin)` to
  drop the sticky EOF/error flags.
- awk needed one more reset: `getrec()` calls `initgetrec()` only on the very
  first call ever, and that is what points a program with no file arguments at
  stdin. `lib.c` now exports `resetgetrec()` and `awk_main()` calls it.

Tests: `pipe-sed-twice`, `pipe-awk-twice`, `pipe-bc-twice`.

---

6c. Historical: approaches considered
--------------------------------------

**Approaches investigated** (kept for the record; Option E is what shipped):

### Option A: Emscripten `pipe()` + async workers

- Implement `pipe()` in JavaScript (a ring buffer shared between two workers via
  `SharedArrayBuffer`)
- Each side of the pipeline gets its own worker (or uses `Atomics.wait` to block)
- Complex; requires `SharedArrayBuffer` (needs `Cross-Origin-Isolation` HTTP headers)
- High compatibility cost

### Option B: Zsh subshell coprocess (`coproc`)

- Zsh has a coprocess mechanism (`coproc`) that may not require fork
- Limited to specific zsh commands

### Option C: Transform pipe-using scripts

- Detect `|` in the script and rewrite to temp files at the JS level before
  sending to zsh
- Fragile (parsing shell is hard); only practical for simple linear pipelines

### Option E: Patch `execpline2` to run pipeline stages in-process ⭐ THIS IS WHAT SHIPPED

**This is the option that should have been on this list from the start, and it is what
Option C is a workaround for.** `bin/setup` already does exactly this for command
substitution: it patches `Src/exec.c` so `zfork()` returns −1 silently on `ENOSYS` under
`#ifdef __EMSCRIPTEN__`, then runs the substituted command **in the current shell**,
`dup2`-ing the pipe onto stdout and reading it back. That is why `$( )` works in this build
while pipes do not.

Only **2 of the 9 `zfork` call sites** in `Src/exec.c` are patched — `zfork` itself
(~line 333) and command substitution (~line 4672). The pipeline site is `execpline2`
(~line 2760) and is untouched.

Doing the same there would let the wasm build run `a | b | c` natively and **delete
`simulatePipes()` entirely**, along with its whole class of bugs:

- It rewrites source it should not touch unless a real ` | ` is present — an anonymous
  function `() { … }` comes out as `{  } { … }`, a parse error. Callers must guard on
  `hasPipelineOp()` first, which is easy to forget (CodeCompared did, and shipped it).
- Temp-file chaining is not pipeline semantics. It happens to match zsh, which runs the
  last stage in the parent shell anyway — but it would NOT match bash, and it silently
  changes behavior for anything relying on a subshell per stage.
- Parsing shell in JavaScript to find the pipes is inherently approximate; the current
  implementation already carries special cases for case-pattern alternation and glob
  qualifiers.

Trade-offs to accept up front, the same ones the `$( )` patch documents in its own comment:
variable assignments in a stage leak to the parent, and output larger than the pipe buffer
may deadlock. Both were judged acceptable for the script workloads this targets.

### Option D: Accept the limitation; document workarounds

Superseded by Option E. Kept for the record; this was the fallback if patching
`execpline2` had not worked out.

```sh
# Instead of:
echo hello | grep hello

# Use temp file (works in wasm):
echo hello > /tmp/t; grep hello /tmp/t

# Or process substitution with a loop:
lines=("${(@f)$(echo hello)}"); for l in $lines; do [[ $l =~ hello ]] && echo $l; done
```

---

6d. Replace the coreutils shims with compiled binaries
-------------------------------------------------------

**Status:** Open. The remaining half of the "stop working around no-fork and
fix it properly" pair — pipelines were the other half and are now done (6 above).

`BUILTINS_PREAMBLE` in `web/zsh-runtime.js` is ~27 KB of zsh functions reimplementing 56
coreutils commands. It is a workaround, and it behaves like one — four real bugs were found
in it on 2026-07-31 (see 1d above), all invisible to a test suite that only exercised file
arguments.

**The pattern to follow already exists in this repo:** `awk`, `sed` and `bc` are compiled in
as real loadable zsh modules (`zsh/awk`, `zsh/sed`, `zsh/bc` — see `bin/build --with-awk`
and the `build-awk/`, `build-sed/`, `build-bc/` object directories). Doing the same for
`ls`, `cat`, `grep`, `head`, `tail`, `cut`, `sort`, `uniq` and `wc` would delete most of the
preamble and make the shims' fidelity question disappear.

Worth evaluating BusyBox or toybox as a single bundle rather than nine separate ports —
one dependency, one build step, and a far larger command surface for the same effort.

Until then the shims stay, and the note in 1d about `wc`'s unpadded output being a
deliberate project convention still applies.

**Checklist:**
- [ ] Evaluate BusyBox/toybox as one bundle vs. individual ports
- [ ] Port the first command (`grep` is the highest-value — see item 2) and
      confirm the module pattern still holds now that stdin re-entrancy is
      handled by `embed/embed_stdin.h`
- [ ] Delete each shim from `BUILTINS_PREAMBLE` as its compiled version lands

---

7. idbfs testing
----------------

**Status:** The `{ fs: 'idbfs' }` option exists and the code path is wired, but
it has never been explicitly tested. If it's broken, we don't know.

**Checklist:**
- [ ] Write a Playwright test that:
  1. Calls `runZshScript('echo persistent > /home/user/test.txt', { fs: 'idbfs' })`
  2. Calls `runZshScript('cat /home/user/test.txt', { fs: 'idbfs' })` in a
     second call (simulating a page reload is harder — at minimum verify
     within-session persistence between two calls)
- [ ] Document the `IDBFS_MOUNT` path (`/home/user`) in the README
- [ ] Test that the default `memfs` path does NOT persist between calls (already
      implicitly tested by test isolation, but worth making explicit)

**Obstacles:** idbfs requires the browser's IndexedDB API. Playwright's
Chromium has IndexedDB but it may behave differently under `file://` vs. a
real HTTP server. Tests must run against the HTTP server (already the case with
`npx playwright test`).

---

8. Module install-on-demand (prerequisite for jq and future tools)
------------------------------------------------------------------

**Status:** Architectural research. Currently all compiled-in tools are baked
into the wasm binary at build time. Each `--with-X` flag increases binary size
for everyone.

**Goal:** Allow users to load additional wasm modules (grep, bc, jq, diff, …)
on demand — only paying for what they use.

**Approaches:**

### Option A: Separate wasm binaries

- Build `zsh-grep.wasm`, `zsh-bc.wasm`, etc. as separate Emscripten modules
- Ship them as separate npm packages (`zsh-wasm-grep`, etc.) or as optional
  files in the main package
- At runtime, load and link dynamically via Emscripten's dynamic linking
  (`MAIN_MODULE` / `SIDE_MODULE`)

Emscripten supports dynamic linking but it's complex and has restrictions (all
code must be compiled as PIC with `-fPIC`). Requires rebuilding the main binary
with `MAIN_MODULE=1`.

### Option B: Wasm component model

- Use the emerging WebAssembly Component Model to compose modules at runtime
- Very new (2024–2025); toolchain support is still maturing

### Option C: Keep the shim as fallback; compiled tools are opt-in at build time

- Status quo: `--with-grep`, `--with-bc`, etc.
- Provide multiple pre-built npm packages: `zsh-wasm` (slim), `zsh-wasm-full`
  (with sed, awk, grep, bc)
- No runtime loading; users choose at install time

**Recommendation:** Option C is the practical path for `0.x`. Start Option A
research when the tool list grows large enough that the monolithic binary
becomes a real problem. jq specifically is deferred until Option A is viable.

**Checklist (Option C — short-term):**
- [ ] Decide which tools are in the "default published" npm binary
  - Current recommendation: include sed, awk, grep, bc (once built)
  - This makes the published package self-contained for most scripting use
- [ ] Document the `--with-X` flags so downstream users who build from source
      know how to customize

**Checklist (Option A — future research):**
- [ ] Spike: build a trivial "hello" side module and load it into the main wasm
- [ ] Evaluate Emscripten dynamic linking API (`dlopen`/`dlsym`) in a worker
- [ ] Prototype `runZshScript(src, { modules: ['grep', 'bc'] })`

---

9. jq (deferred — needs install-on-demand)
------------------------------------------

**Status:** Deferred. jq is not installed by default on all systems and carries
a heavier weight (its own query language, PCRE regex engine, ~150 KLOC). It
makes more sense as an optional module than as a default binary.

**When to revisit:** After the install-on-demand module system (item 8 above)
has a working prototype. At that point, jq becomes an installable add-on rather
than a bloat-or-skip binary decision.

**Notes for the future:**
- jq uses a Bison grammar (needs a bison-generated parser; build-time dependency)
- jq embeds `oniguruma` regex by default; could use `--without-oniguruma` to
  fall back to POSIX regex
- The jq test suite is excellent and would serve as a ready-made test corpus
- License: MIT

---

10. Demo site improvements
--------------------------

**Status:** `web/index.html` exists but predates sed, awk, and most shims.

**Checklist:**
- [ ] Add examples showcasing sed, awk, grep (once compiled)
- [ ] Add an example using `bc` for floating-point math
- [x] ~~Add a "what doesn't work" message for pipes~~ — removed along with
      `simulatePipes()`: pipes work now, so the diagnostic and its test are gone.
- [x] Add syntax highlighting for zsh code in the example editor

---

Priority Order Summary
----------------------

| #   | Item                      | Effort   | Removes knownFail | Impact                     |
| --- | ------------------------- | -------- | ----------------- | -------------------------- |
| 1a  | zsh/mathfunc static build | 30 min   | yes               | low                        |
| 1b  | grep shim stdin           | 1 hr     | yes               | medium                     |
| 1c  | wc/cat stdin              | 1 hr     | no                | low                        |
| 2   | Compiled grep             | 2–3 days | yes               | high                       |
| 3   | Compiled bc               | 2–3 days | no                | medium                     |
| 4   | find shim                 | 2 hr     | no                | medium                     |
| 5   | Compiled diff             | 1–2 days | no                | low                        |
| 6   | Pipelines without fork()  | done     | yes               | very high                  |
| 6d  | Compiled coreutils        | weeks    | no                | high                       |
| 7   | idbfs testing             | 2 hr     | no                | medium                     |
| 8   | Module install-on-demand  | weeks    | no                | high (prerequisite for jq) |
| 9   | jq                        | weeks    | no                | high (after #8)            |
| 10  | Demo improvements         | 2–4 hr   | no                | medium                     |
