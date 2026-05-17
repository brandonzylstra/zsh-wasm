# Project Plan — Beyond the Current Build

This document covers planned and proposed work beyond the npm publishing
checklist (see `docs/NPM.md`). Items are ordered roughly by priority / effort
ratio. Each section includes a checklist, implementation notes, and known
obstacles.

---

## 1. Quick Wins

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
from stdin content (matching `$(<file)` behaviour) to avoid off-by-one in
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

## 2. Compiled grep (`--with-grep`)

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

## 3. Compiled `bc`

**Status:** Planned. `$(( ... ))` in zsh is integer-only. Scripts that need
floating-point math (e.g., `echo "scale=2; 22/7" | bc`) have no alternative
today.

**Source:** [Gavin Howard's bc](https://git.gavinhoward.com/gavin/bc) — the
implementation that ships with macOS 14+ and many BSDs. MIT license, ~12 KLOC
of portable C. Key advantages:

- No yacc/flex dependency (hand-written parser)
- Explicitly designed for portability (runs on embedded systems, WASM-friendly)
- Supports both POSIX `bc` and `dc` modes
- No readline/history dependency at compile time (`BC_ENABLE_HISTORY=0`)
- MIT license — no attribution complications

**Checklist:**
- [ ] Download Gavin Howard bc source into `bc-src/` (tag a specific release)
- [ ] Build it natively first to understand the build system
- [ ] Identify all `exit()` calls → replace with `bc_do_exit()` + `longjmp`
- [ ] Identify file-scope statics that need reset between calls
- [ ] Create `bc_embed.h` / `bc_embed.c`
- [ ] Create `bc_mod.c` (zsh builtin glue)
- [ ] Create `bc.mdd`
- [ ] Add `--with-bc` flag to `bin/build`
- [ ] Rebuild; test `echo "scale=4; 1/3" | bc` → `0.3333` (but see obstacle 1)
- [ ] Add tests: basic arithmetic, scale, `sqrt()`, `define` functions
- [ ] Update README and ROADMAP

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

## 4. `find` shim

**Status:** Not yet shimmed. `find` is commonly used but a full implementation
is impractical as a zsh shim. A partial shim covering ~80% of real-world usage
is feasible.

**Checklist:**
- [ ] Implement `find DIR -name PATTERN [-type f|d]` → zsh glob
- [ ] Implement `find DIR -maxdepth N`
- [ ] Implement `find DIR -newer FILE` (uses `zstat` mtime comparison)
- [ ] Add tests for each form
- [ ] Document which `find` flags are unsupported

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

## 5. Compiled diff (`--with-diff`)

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

## 6. Pipe simulation (long-term research)

**Status:** Research / uncertain. The single biggest real-world limitation.
`echo hello | grep hello` fails because both sides of `|` need separate
processes, and `fork()` is not available.

**Approaches to investigate:**

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

### Option D: Accept the limitation; document workarounds

The most pragmatic short-term answer. Provide a guide in the README:

```sh
# Instead of:
echo hello | grep hello

# Use temp file (works in wasm):
echo hello > /tmp/t; grep hello /tmp/t

# Or process substitution with a loop:
lines=("${(@f)$(echo hello)}"); for l in $lines; do [[ $l =~ hello ]] && echo $l; done
```

**Checklist (for Option D — documentation path):**
- [ ] Add "Pipe workarounds" section to README Known Limitations
- [ ] Add wasm-specific examples that avoid pipes
- [ ] Track Option A as a future research spike

---

## 7. idbfs testing

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

## 8. Module install-on-demand (prerequisite for jq and future tools)

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
      know how to customise

**Checklist (Option A — future research):**
- [ ] Spike: build a trivial "hello" side module and load it into the main wasm
- [ ] Evaluate Emscripten dynamic linking API (`dlopen`/`dlsym`) in a worker
- [ ] Prototype `runZshScript(src, { modules: ['grep', 'bc'] })`

---

## 9. jq (deferred — needs install-on-demand)

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

## 10. Demo site improvements

**Status:** `web/index.html` exists but predates sed, awk, and most shims.

**Checklist:**
- [ ] Add examples showcasing sed, awk, grep (once compiled)
- [ ] Add an example using `bc` for floating-point math
- [ ] Add a "what doesn't work" section (pipes, subshells)
- [ ] Add syntax highlighting for zsh code in the example editor

---

## Priority Order Summary

| # | Item | Effort | Removes knownFail | Impact |
|---|------|--------|-------------------|--------|
| 1a | zsh/mathfunc static build | 30 min | yes | low |
| 1b | grep shim stdin | 1 hr | yes | medium |
| 1c | wc/cat stdin | 1 hr | no | low |
| 2 | Compiled grep | 2–3 days | yes | high |
| 3 | Compiled bc | 2–3 days | no | medium |
| 4 | find shim | 2 hr | no | medium |
| 5 | Compiled diff | 1–2 days | no | low |
| 6 | Pipe simulation | weeks | yes | very high |
| 7 | idbfs testing | 2 hr | no | medium |
| 8 | Module install-on-demand | weeks | no | high (prerequisite for jq) |
| 9 | jq | weeks | no | high (after #8) |
| 10 | Demo improvements | 2–4 hr | no | medium |
