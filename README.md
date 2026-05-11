Zsh Wasm
========

Compile the Z Shell for web assembly using emscripten.

I'm attempting this to support the Zsh cheatsheet on [Ruby.CodeCompared.To/Zsh](https://Ruby.CodeCompared.To/Zsh)
since I use Zsh far more than Bash, and it's the default shell on macOS,
the OS historically used by a majority of Rubyists.


How To
------

Hoping (something like) this will work on my machine 😅

```
mkdir -p build
cd build
emconfigure ../bash-5.3/configure --build="$(bash ../bash-5.3/support/config.guess)" --host wasm32-unknown-emscripten --cache-file=../cache.txt  --without-bash-malloc
emmake make LDFLAGS='-sFORCE_FILESYSTEM=1 -sEXPORTED_RUNTIME_METHODS=FS,callMain -sMODULARIZE=1 -sEXPORT_NAME=createBashModule'
cd ../web
python3 -mhttp.server
```

License
--------

GPLv3, but soon to be released under [the Zsh License](https://Ruby.CodeCompared.To/Zsh) as soon as Bash is removed.
