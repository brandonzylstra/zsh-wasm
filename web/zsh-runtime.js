// Core wasm runner — no DOM dependencies. Used by both zsh-loader.js and test.html.

export function ansiToHtml(text) {
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const fg = {
        30:'#484f58', 31:'#ff7b72', 32:'#3fb950', 33:'#e3b341',
        34:'#58a6ff', 35:'#bc8cff', 36:'#39c5cf', 37:'#b1bac4',
        90:'#6e7681', 91:'#ffa198', 92:'#56d364', 93:'#e3b341',
        94:'#79c0ff', 95:'#d2a8ff', 96:'#56d8e4', 97:'#f0f6fc',
    };
    const bg = {
        40:'#161b22', 41:'#ff7b72', 42:'#3fb950', 43:'#e3b341',
        44:'#58a6ff', 45:'#bc8cff', 46:'#39c5cf', 47:'#b1bac4',
    };

    let depth = 0;
    const result = text.replace(/\x1b\[([0-9;]*)m/g, (_, seq) => {
        const codes = seq.split(';').map(Number);
        let out = '';
        for (const c of codes) {
            if (c === 0) {
                out += '</span>'.repeat(depth);
                depth = 0;
            } else {
                const style = c === 1 ? 'font-weight:bold'
                            : c === 2 ? 'opacity:0.5'
                            : c === 3 ? 'font-style:italic'
                            : c === 4 ? 'text-decoration:underline'
                            : fg[c]   ? `color:${fg[c]}`
                            : bg[c]   ? `background:${bg[c]}`
                            : '';
                if (style) { out += `<span style="${style}">`; depth++; }
            }
        }
        return out;
    });
    return result + '</span>'.repeat(depth);
}

export function isRuntimeNoise(txt) {
    return txt.startsWith('warning: unsupported syscall:') ||
           txt.startsWith('program exited (with status:');
}

export const ZSH_FS = (globalThis.ZshWasmConfig?.fs ?? 'memfs').toLowerCase();
export const IDBFS_MOUNT = '/home/user';

export const BUILTINS_PREAMBLE = `\
touch() { local f; for f; do : >> "$f"; done }
cat() {
  local f
  if (( $# == 0 )); then
    local _stdin
    IFS= read -r -d '' _stdin
    print -rn -- "$_stdin"
  else
    for f; do print -r -- "$(<$f)"; done
  fi
}
wc() {
  local do_l=0 do_w=0 do_c=0 default=1 f content label out nw _iw j ch
  local -a args _wl
  local -A _wst
  for a; do
    if [[ $a == -* ]]; then
      default=0
      [[ $a == *l* ]] && do_l=1
      [[ $a == *w* ]] && do_w=1
      [[ $a == *c* ]] && do_c=1
    else
      args+=($a)
    fi
  done
  (( default )) && do_l=1 do_w=1 do_c=1
  local -a sources
  (( \${#args} )) && sources=("\${(@)args}") || sources=('-')
  for f in "\${(@)sources}"; do
    if [[ $f == - ]]; then
      IFS= read -r -d '' content
      content=\${content%$'\n'}
      label=''
    else
      content=$(<$f)
      label=" $f"
    fi
    out=''
    if (( do_l )); then
      _wl=("\${(@f)content}")
      out+=" \${#_wl}"
    fi
    if (( do_w )); then
      nw=0; _iw=0
      for (( j=1; j<=\${#content}; j++ )); do
        ch=\${content[$j]}
        if [[ $ch == [[:space:]] ]]; then _iw=0
        elif (( !_iw )); then _iw=1; (( nw++ ))
        fi
      done
      out+=" $nw"
    fi
    if (( do_c )); then
      if [[ $f == - ]]; then
        out+=" \${#content}"
      else
        zstat -H _wst "$f"
        out+=" \${_wst[size]}"
      fi
    fi
    print -- "\${out# }\${label}"
  done
}
head() {
  local n=10
  [[ $1 == -[0-9]* ]] && n=\${1#-} && shift
  [[ $1 == -n      ]] && n=$2      && shift 2
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    print -l -- \${lines[1,$n]}
  done
}
tail() {
  local n=10
  [[ $1 == -[0-9]* ]] && n=\${1#-} && shift
  [[ $1 == -n      ]] && n=$2      && shift 2
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    print -l -- \${lines[-$n,-1]}
  done
}
grep() {
  local _gi=0 _gv=0 _gn=0 _gc=0 pat _src line _cnt _num _hit _stdin
  local -a lines _srcs
  while [[ \${1-} == -* ]]; do
    [[ $1 == *i* ]] && _gi=1
    [[ $1 == *v* ]] && _gv=1
    [[ $1 == *n* ]] && _gn=1
    [[ $1 == *c* ]] && _gc=1
    shift
  done
  pat=$1; shift
  (( $# )) && _srcs=("$@") || _srcs=('-')
  for _src in "\${(@)_srcs}"; do
    if [[ $_src == - ]]; then
      IFS= read -r -d '' _stdin
      lines=("\${(@f)_stdin}")
    else
      lines=("\${(@f)$(<$_src)}")
    fi
    _cnt=0; _num=0
    for line in "\${(@)lines}"; do
      (( _num++ ))
      _hit=0
      if (( _gi )); then [[ \${line:l} =~ \${pat:l} ]] && _hit=1
      else               [[ $line =~ $pat ]]            && _hit=1
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
  done
}
_ls_modestr() {
  local m=$1 t p=''
  if   (( (m & 0170000) == 0040000 )); then t=d
  elif (( (m & 0170000) == 0120000 )); then t=l
  elif (( (m & 0170000) == 0100000 )); then t=-
  elif (( (m & 0170000) == 0060000 )); then t=b
  elif (( (m & 0170000) == 0020000 )); then t=c
  elif (( (m & 0170000) == 0010000 )); then t=p
  else t='?'
  fi
  local -a ms=(0400 0200 0100 0040 0020 0010 0004 0002 0001)
  local -a cs=(r    w    x    r    w    x    r    w    x   )
  local i
  for (( i=1; i<=9; i++ )); do (( m & ms[i] )) && p+=$cs[i] || p+='-'; done
  _MODESTR="$t$p"
}
ls() {
  local show_all=0 long=0 recursive=0
  local -a args
  for a; do
    if [[ $a == -* ]]; then
      [[ $a == *[aA]* ]] && show_all=1
      [[ $a == *l*   ]] && long=1
      [[ $a == *R*   ]] && recursive=1
    else
      args+=($a)
    fi
  done
  local d=\${args[1]:-.}
  local -a files
  if   (( recursive && show_all )); then files=($d/**/*(DN))
  elif (( recursive ));             then files=($d/**/*(N))
  elif (( show_all ));              then files=($d/*(DN))
  else                                   files=($d/*(N))
  fi
  (( long )) && zmodload zsh/datetime 2>/dev/null
  local f name _ls_ts
  local -A _ls_stat
  for f in $files; do
    (( recursive )) && name="\${f#\${d%/}/}" || name="\${f:t}"
    if (( long )); then
      zstat -H _ls_stat "$f"
      _ls_modestr $_ls_stat[mode]
      strftime -s _ls_ts '%b %e %H:%M' $_ls_stat[mtime]
      printf '%s %6d %s %s\\n' "$_MODESTR" "$_ls_stat[size]" "$_ls_ts" "$name"
    else
      print $name
    fi
  done
}
cp() { print -r -- "$(<$1)" > "$2" }
mv() { cp "$1" "$2" && zf_rm "$1" }
date() {
  zmodload zsh/datetime 2>/dev/null
  local fmt='%a %b %e %H:%M:%S UTC %Y'
  [[ $1 == +* ]] && fmt=\${1#+}
  strftime $fmt $EPOCHSECONDS
}
sort() {
  local rev=0 num=0 uniq_flag=0 key=0
  local -a args
  local skip_next=0
  for a; do
    if (( skip_next )); then key=$a; skip_next=0; continue; fi
    if [[ $a == -* ]]; then
      [[ $a == *r* ]] && rev=1
      [[ $a == *n* ]] && num=1
      [[ $a == *u* ]] && uniq_flag=1
      if [[ $a == -k ]]; then skip_next=1
      elif [[ $a == -k* ]]; then key=\${a#-k}
      fi
    else
      args+=($a)
    fi
  done
  # Strip ,end and flags from key spec (e.g. "2,2n" -> "2")
  [[ $key == *,* ]] && key=\${key%%,*}
  key=\${key%%[^0-9]*}
  local -a lines
  local f
  for f in $args; do lines+=("\${(@f)$(<$f)}"); done
  if (( key > 0 )); then
    # Extract field $key (whitespace-delimited) for sorting, then sort
    local -a keyed
    local line
    for line in "\${(@)lines}"; do
      local -a words=(\${(z)line})
      keyed+=("\${words[$key]:-}	$line")
    done
    if   (( num && rev )); then keyed=("\${(@On)keyed}")
    elif (( num ));        then keyed=("\${(@on)keyed}")
    elif (( rev ));        then keyed=("\${(@O)keyed}")
    else                        keyed=("\${(@o)keyed}")
    fi
    lines=()
    for line in "\${(@)keyed}"; do lines+=("\${line#*	}"); done
  else
    if   (( num && rev )); then lines=("\${(@On)lines}")
    elif (( num ));        then lines=("\${(@on)lines}")
    elif (( rev ));        then lines=("\${(@O)lines}")
    else                        lines=("\${(@o)lines}")
    fi
  fi
  if (( uniq_flag )); then
    local -a u; local prev; local first=1
    for l in "\${(@)lines}"; do
      if (( first )) || [[ $l != $prev ]]; then u+=("$l"); prev=$l; first=0; fi
    done
    lines=("\${(@)u}")
  fi
  (( \${#lines} )) && print -l -- "\${(@)lines}"
}
uniq() {
  local -a args
  for a; do [[ $a != -* ]] && args+=($a); done
  local -a lines
  (( \${#args} )) && lines=("\${(@f)$(<$args[1])}")
  local prev line first=1
  for line in "\${(@)lines}"; do
    if (( first )) || [[ $line != $prev ]]; then print -- "$line"; prev=$line; first=0; fi
  done
}
cut() {
  local delim=$'\\t' fields='' chars=''
  local -a args
  while (( $# )); do
    case $1 in
      -d)  shift; delim=$1 ;;
      -d*) delim=\${1#-d} ;;
      -f)  shift; fields=$1 ;;
      -f*) fields=\${1#-f} ;;
      -c)  shift; chars=$1 ;;
      -c*) chars=\${1#-c} ;;
      -*)  ;;
      *)   args+=($1) ;;
    esac
    shift
  done
  local f line cs ss ee result fspec s e _jo _jf _o
  local sep=$'\\x01'
  local -a lines parts out
  for f in $args; do
    lines=("\${(@f)$(<$f)}")
    for line in "\${(@)lines}"; do
      if [[ -n $chars ]]; then
        result=''
        for cs in \${(s:,:)chars}; do
          if [[ $cs == *-* ]]; then
            ss=\${cs%-*}
            ee=\${cs#*-}
            [[ -z $ss ]] && ss=1
            [[ -z $ee ]] && ee=\${#line}
            result+=\${line[$ss,$ee]}
          else
            result+=\${line[$cs]}
          fi
        done
        print -- "$result"
      else
        parts=("\${(@ps:\\x01:)\${line//\$delim/\$sep}}")
        out=()
        for fspec in \${(s:,:)fields}; do
          if [[ $fspec == *-* ]]; then
            s=\${fspec%-*}
            e=\${fspec#*-}
            [[ -z $s ]] && s=1
            [[ -z $e ]] && e=\${#parts}
            out+=("\${(@)parts[$s,$e]}")
          else
            out+=("\${parts[$fspec]}")
          fi
        done
        _jo='' _jf=1
        for _o in "\${(@)out}"; do
          if (( _jf )); then _jo=$_o _jf=0
          else               _jo+=\$delim$_o
          fi
        done
        print -- "$_jo"
      fi
    done
  done
}
tr() {
  local delete=0
  local -a args
  for a; do
    [[ $a == -d ]] && delete=1 && continue
    [[ $a == -* ]] && continue
    args+=($a)
  done
  local content
  IFS= read -r -d '' content
  if (( delete )); then
    local c
    for (( i=1; i<=\${#args[1]}; i++ )); do
      c=\${args[1][$i]}
      content=\${content//$c}
    done
  else
    local set1=\${args[1]} set2=\${args[2]}
    if   [[ $set1 == 'a-z' && $set2 == 'A-Z' ]]; then content=\${(U)content}
    elif [[ $set1 == 'A-Z' && $set2 == 'a-z' ]]; then content=\${(L)content}
    else
      local i
      for (( i=1; i<=\${#set1} && i<=\${#set2}; i++ )); do
        content=\${content//\${set1[$i]}/\${set2[$i]}}
      done
    fi
  fi
  print -rn -- "$content"
}
basename() {
  local p=$1 s=\${2:-}
  while [[ \${#p} -gt 1 && $p == */ ]]; do p=\${p%/}; done
  p=\${p##*/}
  [[ -z $p ]] && p=/
  [[ -n $s && $p == *$s ]] && p=\${p%$s}
  print -- "$p"
}
dirname() {
  local p=$1
  while [[ \${#p} -gt 1 && $p == */ ]]; do p=\${p%/}; done
  [[ $p == / ]] && { print /; return }
  [[ $p != */* ]] && { print .; return }
  p=\${p%/*}
  print -- "\${p:-/}"
}
tee() {
  local append=0
  local -a files
  for a; do
    [[ $a == -a ]] && append=1 && continue
    [[ $a == -* ]] && continue
    files+=($a)
  done
  local content
  IFS= read -r -d '' content
  local f
  for f in $files; do
    if (( append )); then print -rn -- "$content" >> $f
    else             print -rn -- "$content" >  $f
    fi
  done
  print -rn -- "$content"
}
seq() {
  local first=1 step=1 last
  case $# in
    1) last=$1 ;;
    2) first=$1; last=$2 ;;
    3) first=$1; step=$2; last=$3 ;;
    *) print -u2 "seq: wrong number of arguments"; return 1 ;;
  esac
  local i
  if (( step > 0 )); then
    for (( i=first; i<=last; i+=step )); do print -- $i; done
  elif (( step < 0 )); then
    for (( i=first; i>=last; i+=step )); do print -- $i; done
  fi
}
mktemp() {
  local makedirs=0
  local template='/tmp/tmp.XXXXXX'
  for a; do
    [[ $a == -d ]] && makedirs=1 && continue
    [[ $a == -* ]] && continue
    template=$a
  done
  local base=$template nX=0
  while [[ $base == *X ]]; do base=\${base%X}; (( nX++ )); done
  local rand
  rand=$(printf '%012d' $(( (RANDOM << 15 | RANDOM) & 0x7FFFFFFF )))
  rand=\${rand[-$nX,-1]}
  local result=\${base}\${rand}
  if (( makedirs )); then mkdir -p "$result"
  else touch "$result"
  fi
  print -- "$result"
}
sleep() { : }
rm() {
  local force=0 recursive=0
  local -a targets
  for a; do
    case $a in
      -*) [[ $a == *f* ]] && force=1; [[ $a == *[rR]* ]] && recursive=1 ;;
      *)  targets+=($a) ;;
    esac
  done
  local f p
  for f in $targets; do
    if [[ -d $f ]] && (( recursive )); then
      local -a rfiles rdirs
      rfiles=($f/**/*(ND.))
      rdirs=($f/**/*(ND/))
      for p in $rfiles; do zf_rm -- $p 2>/dev/null || true; done
      for p in \${(Oa)rdirs} $f; do zf_rmdir -- $p 2>/dev/null || true; done
    elif [[ -d $f ]]; then
      (( force )) || { print -u2 "rm: $f: is a directory"; return 1 }
    elif (( force )); then
      zf_rm -- $f 2>/dev/null || true
    else
      zf_rm -- $f
    fi
  done
}
`;

// Runs a zsh script off the main thread via a Web Worker.
// Returns { stdout, stderr } as plain strings.
// Detect pipeline operator (not || and not |& or |>).
// Used to emit a helpful message when a forked pipeline silently produces no output.
function hasPipelineOp(src) {
    return / \| /.test(src);
}

export function runZshScript(src, { stdin = null, fs = null } = {}) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./zsh-worker.js', import.meta.url));
        worker.onmessage = ({ data }) => {
            worker.terminate();
            let { stdout, stderr, exitCode } = data;
            // When a pipeline produces no output at all, zsh-wasm silently swallows
            // the fork() failure. Emit a helpful diagnostic so users know what happened.
            if (!stdout && !stderr && hasPipelineOp(src)) {
                stderr = 'zsh-wasm: pipes require fork(), which is not available in WebAssembly.\n' +
                         '  Use here-strings or heredocs instead of pipelines.\n' +
                         "  Example: bc <<< '1+1'  (not: echo '1+1' | bc)";
            }
            resolve({ stdout, stderr, exitCode });
        };
        worker.onerror = (e) => {
            worker.terminate();
            reject(e);
        };
        worker.postMessage({
            src: BUILTINS_PREAMBLE + src + '\n',
            fs: fs ?? ZSH_FS,
            idbfsMount: IDBFS_MOUNT,
            stdin,
        });
    });
}
