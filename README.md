Zsh Wasm
========

Compile the Z Shell for web assembly using emscripten.

Built to support the Zsh cheatsheet on [Ruby.CodeCompared.To/Zsh](https://Ruby.CodeCompared.To/Zsh)
since Zsh is the default shell on macOS, the OS historically used by a majority of Rubyists.

Demo
----

Open `web/index.html` (served via an HTTP server — see below) to see zsh running in the browser.

How To Build
------------

### Prerequisites

- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) (`emcc`, `emmake`, `emconfigure`)
- The zsh 5.9 source (`zsh-5.9/` directory — see below)

### 1. Download zsh source

```
curl -L -O https://www.zsh.org/pub/zsh-5.9.tar.xz
tar xf zsh-5.9.tar.xz
```

### 2. Build the ncurses stub

Zsh requires ncurses, which is not available in emscripten's sysroot. We provide a
minimal stub that satisfies the linker. (ZLE is compiled in but its ncurses calls
are no-ops; script execution doesn't use the terminal at all.)

```
cd ncurses-stub
emcc -c ncurses_stub.c -o ncurses_stub.o
emar rcs lib/libncurses.a ncurses_stub.o
cd ..
```

### 3. Configure

```
mkdir -p build-zsh
cd build-zsh
STUB="$(pwd)/../ncurses-stub"
emconfigure ../zsh-5.9/configure \
  --build="$(../zsh-5.9/config.guess)" \
  --host=wasm32-unknown-emscripten \
  --disable-dynamic \
  --without-tcsetpgrp \
  --disable-dynamic-nss \
  CPPFLAGS="-I$STUB/include" \
  LDFLAGS="-L$STUB/lib" \
  LIBS="-lncurses" \
  CFLAGS="-Os"
```

### 4. Patch generated config.h

Two configure tests produce wrong results under emscripten:

```
# Disable setresuid/setresgid — declared in emcc libc but not in its headers
sed -i '' 's/^#define HAVE_SETRESGID 1/\/* #define HAVE_SETRESGID 1 *\//' config.h
sed -i '' 's/^#define HAVE_SETRESUID 1/\/* #define HAVE_SETRESUID 1 *\//' config.h

# Enable tgoto prototype (our ncurses stub doesn't auto-declare it)
sed -i '' 's|\/\* #undef TGOTO_PROTO_MISSING \*\/|#define TGOTO_PROTO_MISSING 1|' config.h

# Enable term.h support so ncurses headers get included transitively
sed -i '' 's|\/\* #undef ZSH_HAVE_TERM_H \*\/|#define ZSH_HAVE_TERM_H 1|' config.h
```

Also patch the generated build files:

```
# Tell the build system where term.h is
sed -i '' 's/^ZSH_TERM_H = $/ZSH_TERM_H = term.h/' Config/defs.mk

# Regenerate zshterm.h
echo '#include <term.h>' > Src/zshterm.h
```

### 5. Build

```
emmake make \
  LDFLAGS="-L$(pwd)/../ncurses-stub/lib \
    -sFORCE_FILESYSTEM=1 \
    -sEXPORTED_RUNTIME_METHODS=FS,callMain \
    -sMODULARIZE=1 \
    -sEXPORT_NAME=createZshModule"
```

### 6. Deploy to web

```
cp Src/zsh     ../web/zsh.js
cp Src/zsh.wasm ../web/zsh.wasm
cd ..
```

### 7. Test

```
cd web
python3 -m http.server
# open http://localhost:8000/
```

Using in HTML
-------------

```html
<!-- load the wasm module -->
<script src="./zsh.js"></script>
<!-- load the helper that runs <script type="text/zsh"> tags -->
<script src="./zsh-loader.js" type="module"></script>

<!-- inline zsh script — output goes to #zsh-output -->
<pre id="zsh-output"></pre>
<script type="text/zsh" data-stdout="#zsh-output">
echo "Hello from zsh $ZSH_VERSION"
fruits=(apple banana cherry)
for f in $fruits; echo "  $f"
</script>
```

Or call `runZshScript(src, stdoutSelector, stderrSelector)` directly from JavaScript.

Known Limitations
-----------------

- **No job control** — `sigsuspend`, `prlimit`, `getrusage` syscalls are stubs or
  unsupported; you'll see harmless warnings in the console.
- **No filesystem persistence** — the emscripten virtual FS is reset each module
  instantiation.
- **ZLE is no-op** — interactive line editing requires a real terminal; it is
  compiled in but its terminal calls return immediately.

License
-------

[The Zsh License](https://github.com/zsh-users/zsh/blob/master/LICENCE).
