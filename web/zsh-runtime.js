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
  local n=10 _bytes=0 f _stdin _content
  local -a lines
  if   [[ \${1-} == -c ]]; then _bytes=1; n=$2; shift 2
  elif [[ \${1-} == -c* ]]; then _bytes=1; n=\${1#-c}; shift
  elif [[ \${1-} == -[0-9]* ]]; then n=\${1#-}; shift
  elif [[ \${1-} == -n ]]; then n=$2; shift 2
  elif [[ \${1-} == -n* ]]; then n=\${1#-n}; shift
  fi
  if (( _bytes )); then
    if (( $# )); then
      for f; do _content=$(<$f); print -- \${_content[1,$n]}; done
    else
      IFS= read -r -d '' _stdin; print -- \${_stdin[1,$n]}
    fi
  else
    if (( $# )); then
      for f; do lines=("\${(@f)$(<$f)}"); print -l -- \${lines[1,$n]}; done
    else
      IFS= read -r -d '' _stdin
      lines=("\${(@f)_stdin}")
      print -l -- \${lines[1,$n]}
    fi
  fi
}
tail() {
  local n=10 _bytes=0 f _stdin _content
  local -a lines
  if   [[ \${1-} == -c ]]; then _bytes=1; n=$2; shift 2
  elif [[ \${1-} == -c* ]]; then _bytes=1; n=\${1#-c}; shift
  elif [[ \${1-} == -[0-9]* ]]; then n=\${1#-}; shift
  elif [[ \${1-} == -n ]]; then n=$2; shift 2
  elif [[ \${1-} == -n* ]]; then n=\${1#-n}; shift
  fi
  if (( _bytes )); then
    if (( $# )); then
      for f; do _content=$(<$f); print -- \${_content[-$n,-1]}; done
    else
      IFS= read -r -d '' _stdin; print -- \${_stdin[-$n,-1]}
    fi
  else
    if (( $# )); then
      for f; do lines=("\${(@f)$(<$f)}"); print -l -- \${lines[-$n,-1]}; done
    else
      IFS= read -r -d '' _stdin
      lines=("\${(@f)_stdin}")
      print -l -- \${lines[-$n,-1]}
    fi
  fi
}
grep() {
  local _gi=0 _gv=0 _gn=0 _gc=0 _ga=0 _gb=0 _gr=0 _gl=0 _go=0 _gm=0 _gH=0 _gq=0 _gw=0 _any_hit=0
  local pat _src line _cnt _num _hit _stdin _pfx _rest _rest_lc _match_out _file_hit _show_fname
  local _i _from _to _last_end
  local -a lines _srcs _matched _ge
  while [[ \${1-} == -* ]]; do
    case $1 in
      -A)  shift; _ga=$1 ;;
      -A*) _ga=\${1#-A} ;;
      -B)  shift; _gb=$1 ;;
      -B*) _gb=\${1#-B} ;;
      -C)  shift; _ga=$1; _gb=$1 ;;
      -C*) _ga=\${1#-C}; _gb=\${1#-C} ;;
      -e)  shift; _ge+=($1) ;;
      -e*) _ge+=(\${1#-e}) ;;
      -m)  shift; _gm=$1 ;;
      -m*) _gm=\${1#-m} ;;
      -H)  _gH=1 ;;
      --)  shift; break ;;
      *)
        [[ $1 == *i* ]] && _gi=1
        [[ $1 == *v* ]] && _gv=1
        [[ $1 == *n* ]] && _gn=1
        [[ $1 == *c* ]] && _gc=1
        [[ $1 == *[rR]* ]] && _gr=1
        [[ $1 == *l* ]] && _gl=1
        [[ $1 == *o* ]] && _go=1
        [[ $1 == *q* ]] && _gq=1
        [[ $1 == *w* ]] && _gw=1
        [[ $1 == *h* ]] && _gH=-1
        ;;
    esac
    shift
  done
  (( \${#_ge} )) && pat=\${(j:|:)_ge} || { pat=$1; shift }
  (( _gw )) && pat="(^|[^[:alnum:]_])(\${pat})([^[:alnum:]_]|$)"
  if (( _gr )); then
    (( $# )) && _srcs=("$@") || _srcs=('.')
    local -a _exp=()
    for _src in "\${(@)_srcs}"; do
      if [[ -d $_src ]]; then _exp+=( \${_src}/**/*(.N) )
      else                    _exp+=( $_src )
      fi
    done
    _srcs=("\${(@)_exp}")
  else
    (( $# )) && _srcs=("$@") || _srcs=('-')
  fi
  _show_fname=0
  (( \${#_srcs} > 1 )) && _show_fname=1
  (( _gH == 1 )) && _show_fname=1
  (( _gH == -1 )) && _show_fname=0
  for _src in "\${(@)_srcs}"; do
    if [[ $_src == - ]]; then
      IFS= read -r -d '' _stdin
      lines=("\${(@f)_stdin}")
    else
      lines=("\${(@f)$(<$_src)}")
    fi
    _cnt=0; _num=0; _file_hit=0
    if (( _show_fname )); then _pfx="\${_src}:"; else _pfx=""; fi
    if (( _ga || _gb )); then
      _matched=(); _num=0
      for line in "\${(@)lines}"; do
        (( _num++ ))
        _hit=0
        if (( _gi )); then [[ \${line:l} =~ \${pat:l} ]] && _hit=1
        else               [[ $line =~ $pat ]]             && _hit=1
        fi
        (( _gv )) && (( _hit = !_hit ))
        if (( _hit )); then _matched+=($_num); _file_hit=1; fi
        (( _gm && \${#_matched} >= _gm )) && break
        (( _gq && _file_hit )) && break
      done
      _cnt=\${#_matched}
      if (( !_gc && !_gl && !_gq )); then
        _last_end=0
        for _num in "\${(@)_matched}"; do
          _from=$(( _num - _gb ))
          (( _from < 1 )) && _from=1
          _to=$(( _num + _ga ))
          (( _to > \${#lines} )) && _to=\${#lines}
          (( _last_end > 0 && _from > _last_end + 1 )) && print -- '--'
          (( _from <= _last_end )) && _from=$(( _last_end + 1 ))
          for (( _i = _from; _i <= _to; _i++ )); do
            if (( _gn )); then print -- "\${_pfx}$_i:\${lines[$_i]}"
            else               print -- "\${_pfx}\${lines[$_i]}"
            fi
          done
          _last_end=$_to
        done
      fi
    else
      for line in "\${(@)lines}"; do
        (( _num++ ))
        _hit=0
        if (( _gi )); then [[ \${line:l} =~ \${pat:l} ]] && _hit=1
        else               [[ $line =~ $pat ]]             && _hit=1
        fi
        (( _gv )) && (( _hit = !_hit ))
        if (( _hit )); then
          (( _cnt++ )); _file_hit=1
          if (( !_gc && !_gl && !_gq )); then
            if (( _go )); then
              _rest=$line; _rest_lc=\${line:l}
              while true; do
                if (( _gi )); then [[ $_rest_lc =~ \${pat:l} ]] || break
                else               [[ $_rest    =~ $pat      ]] || break
                fi
                [[ -z $MATCH ]] && break
                if (( _gw )); then _match_out=\${match[2]}
                else               _match_out=\${_rest[$MBEGIN,$MEND]}
                fi
                if (( _gn )); then print -- "\${_pfx}\${_num}:\${_match_out}"
                else               print -- "\${_pfx}\${_match_out}"
                fi
                if (( _gw )); then
                  _rest=\${_rest[$((mend[2] + 1)),-1]}
                  _rest_lc=\${_rest_lc[$((mend[2] + 1)),-1]}
                else
                  _rest=\${_rest[$((MEND + 1)),-1]}
                  _rest_lc=\${_rest_lc[$((MEND + 1)),-1]}
                fi
              done
            else
              if (( _gn )); then print -- "\${_pfx}\${_num}:$line"
              else               print -- "\${_pfx}$line"
              fi
            fi
          fi
          (( _gm && _cnt >= _gm )) && break
          (( _gq )) && break
        fi
      done
    fi
    (( _gc && !_gq )) && print -- "\${_pfx}$_cnt"
    (( _gl && _file_hit && !_gq )) && print -- "$_src"
    if (( _file_hit )); then _any_hit=1; fi
    (( _gq && _any_hit )) && break
  done
  return $(( !_any_hit ))
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
  local fmt='%a %b %e %H:%M:%S %z %Y'
  [[ \${1-} == +* ]] && fmt=\${1#+}
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
  local f _stdin
  for f in $args; do lines+=("\${(@f)$(<$f)}"); done
  if (( !\${#args} )); then
    IFS= read -r -d '' _stdin
    lines=("\${(@f)_stdin}")
  fi
  if (( key > 0 )); then
    # Extract field $key (whitespace-delimited) for sorting, then sort
    local -a keyed words
    local line
    for line in "\${(@)lines}"; do
      words=(\${(z)line})
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
  local prev line first=1 _stdin
  if (( \${#args} )); then
    lines=("\${(@f)$(<$args[1])}")
  else
    IFS= read -r -d '' _stdin
    lines=("\${(@f)_stdin}")
  fi
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
sleep() { printf '%s' "\${1:-0}" > /dev/wasm_sleep }
xargs() {
  local _replace='' _max_args=0 _item _arg _line _stdin _cnt=0
  local -a _cmd _items _batch _expanded _flat
  while [[ \${1-} == -* ]]; do
    case \$1 in
      -I)  shift; _replace=\$1 ;;
      -I*) _replace=\${1#-I} ;;
      -n)  shift; _max_args=\$1 ;;
      -n*) _max_args=\${1#-n} ;;
      --) shift; break ;;
      -*) ;;
    esac
    shift
  done
  _cmd=("\$@")
  (( \${#_cmd} == 0 )) && _cmd=(echo)
  IFS= read -r -d '' _stdin
  if [[ -n \$_replace ]]; then
    _items=(\${(f)_stdin})
    _items=("\${(@)_items:#}")
    for _item in "\${(@)_items}"; do
      _expanded=()
      for _arg in "\${(@)_cmd}"; do
        _expanded+=("\${_arg//\${_replace}/\${_item}}")
      done
      "\${_expanded[@]}"
    done
  elif (( _max_args > 0 )); then
    _flat=()
    for _line in \${(f)_stdin}; do _flat+=(\${(z)_line}); done
    _items=("\${(@)_flat:#}")
    _batch=(); _cnt=0
    for _item in "\${(@)_items}"; do
      _batch+=("\$_item")
      (( ++_cnt >= _max_args )) && { "\${_cmd[@]}" "\${_batch[@]}"; _batch=(); _cnt=0 }
    done
    (( \${#_batch} )) && "\${_cmd[@]}" "\${_batch[@]}"
  else
    _flat=()
    for _line in \${(f)_stdin}; do _flat+=(\${(z)_line}); done
    _items=("\${(@)_flat:#}")
    (( \${#_items} )) && "\${_cmd[@]}" "\${_items[@]}"
  fi
}
find() {
  local _dir='.' _type='' _name='' _maxdepth='' _newer=''
  local _dir_set=0 _f _d _rel _depth _nm _newer_mtime=0
  local -a _extra_dirs _items _alldirs _parts
  local -A _nstat _fstat
  while (( \$# )) && [[ \$1 != -* ]]; do
    if (( !_dir_set )); then _dir=\$1; _dir_set=1
    else _extra_dirs+=(\$1)
    fi
    shift
  done
  while (( \$# )); do
    case \$1 in
      -name)     shift; _name=\$1 ;;
      -type)     shift; _type=\$1 ;;
      -maxdepth) shift; _maxdepth=\$1 ;;
      -newer)    shift; _newer=\$1 ;;
      '!' | '(' | ')' | -print | -print0 | -prune | -follow) ;;
      -*) ;;
    esac
    shift
  done
  if [[ -n \$_newer ]]; then
    zstat -H _nstat \$_newer 2>/dev/null && _newer_mtime=\${_nstat[mtime]}
  fi
  _alldirs=(\$_dir \${_extra_dirs[@]})
  for _d in \${_alldirs[@]}; do
    if [[ ! -e \$_d ]]; then
      print -u2 "find: '\$_d': No such file or directory"
      continue
    fi
    _items=(\$_d \$_d/**/*(ND))
    for _f in \${_items[@]}; do
      if [[ -n \$_maxdepth ]]; then
        if [[ \$_f == \$_d ]]; then
          _depth=0
        else
          _rel=\${_f#\${_d}/}
          _parts=(\${(s:/:)_rel})
          _depth=\${#_parts}
        fi
        (( _depth > _maxdepth )) && continue
      fi
      if [[ -n \$_type ]]; then
        [[ \$_type == f && ! -f \$_f ]] && continue
        [[ \$_type == d && ! -d \$_f ]] && continue
        [[ \$_type == l && ! -L \$_f ]] && continue
      fi
      if [[ -n \$_name ]]; then
        _nm=\${_f:t}
        [[ \$_nm != \${~_name} ]] && continue
      fi
      if [[ -n \$_newer ]]; then
        zstat -H _fstat \$_f 2>/dev/null || continue
        (( \${_fstat[mtime]} <= _newer_mtime )) && continue
      fi
      print -- \$_f
    done
  done
}
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
env() {
  local -a _vars _cmd _unset
  local _a _k _v
  while (( $# )); do
    case \${1-} in
      -i | --ignore-environment) ;;
      -u)  shift; _unset+=($1) ;;
      -u*) _unset+=(\${1#-u}) ;;
      --) shift; break ;;
      *=*) _vars+=($1) ;;
      -*) ;;
      *) break ;;
    esac
    shift
  done
  _cmd=("$@")
  if (( !\${#_cmd} )); then
    local _k
    for _k in "\${(@k)parameters}"; do
      [[ \${parameters[$_k]} == *export* ]] && print -- "$_k=\${(P)_k}"
    done
    return
  fi
  for _a in "\${(@)_unset}"; do unset "$_a"; done
  for _a in "\${(@)_vars}"; do
    _k=\${_a%%=*}; _v=\${_a#*=}
    export "$_k=$_v"
  done
  "\${_cmd[@]}"
}
printenv() {
  local _v
  if (( $# )); then
    for _v; do print -- "\${(P)_v}"; done
  else
    for _v in "\${(@k)parameters}"; do
      [[ \${parameters[$_v]} == *export* ]] && print -- "$_v=\${(P)_v}"
    done
  fi
}
which() {
  local _cmd _ret=0
  for _cmd; do
    if (( \${+functions[\$_cmd]} )); then
      print -- "\$_cmd: shell function"
    elif (( \${+builtins[\$_cmd]} )); then
      print -- "\$_cmd: builtin"
    elif whence -p \$_cmd > /dev/null 2>&1; then
      whence -p \$_cmd
    else
      print -u2 "which: no \$_cmd in PATH"
      _ret=1
    fi
  done
  return \$_ret
}
realpath() {
  local _f
  for _f; do print -- \${_f:A}; done
}
ln() {
  local _sym=0 _force=0
  while [[ \${1-} == -* ]]; do
    [[ $1 == *s* ]] && _sym=1
    [[ $1 == *f* ]] && _force=1
    shift
  done
  if (( _sym )); then zf_symlink $1 $2
  else               zf_ln      $1 $2
  fi
}
base64() {
  local _d=0
  [[ \${1-} == -d || \${1-} == --decode ]] && { _d=1; shift; }
  local _alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  local _in _out='' _i _len _b0 _b1 _b2 _v
  IFS= read -r -d '' _in
  _in=\${_in%$'\\n'}
  if (( !_d )); then
    _len=\${#_in}
    _i=1
    local _col=0
    while (( _i <= _len )); do
      _b0=$(printf '%d' "'\${_in[_i]}")
      _b1=0; (( _i+1 <= _len )) && _b1=$(printf '%d' "'\${_in[_i+1]}")
      _b2=0; (( _i+2 <= _len )) && _b2=$(printf '%d' "'\${_in[_i+2]}")
      _out+=\${_alpha[$(( (_b0>>2) + 1 ))]}
      _out+=\${_alpha[$(( (((_b0&3)<<4)|(_b1>>4)) + 1 ))]}
      if (( _i+1 <= _len )); then
        _out+=\${_alpha[$(( (((_b1&15)<<2)|(_b2>>6)) + 1 ))]}
      else
        _out+='='
      fi
      if (( _i+2 <= _len )); then
        _out+=\${_alpha[$(( (_b2&63) + 1 ))]}
      else
        _out+='='
      fi
      (( _i += 3 ))
      (( _col += 4 ))
      if (( _col >= 76 )); then
        _out+=$'\\n'
        _col=0
      fi
    done
    print -- \$_out
  else
    _in=\${_in//[[:space:]]/}
    _len=\${#_in}
    _i=1
    local _c0 _c1 _c2 _c3 _o0 _o1 _o2
    _out=''
    while (( _i+3 <= _len+1 )); do
      if [[ \${_in[_i]} == '=' ]]; then break; fi
      _c0=$(( \${_alpha[(i)\${_in[_i  ]}]} - 1 ))
      _c1=$(( \${_alpha[(i)\${_in[_i+1]}]} - 1 ))
      _c2=0; _c3=0
      _v=$(( (_c0<<2)|(_c1>>4) ))
      _o0=$(( _v>>6 )); _o1=$(( (_v>>3)&7 )); _o2=$(( _v&7 ))
      _out+="\\\\0\${_o0}\${_o1}\${_o2}"
      if [[ \${_in[_i+2]} != '=' ]]; then
        _c2=$(( \${_alpha[(i)\${_in[_i+2]}]} - 1 ))
        _v=$(( ((_c1&15)<<4)|(_c2>>2) ))
        _o0=$(( _v>>6 )); _o1=$(( (_v>>3)&7 )); _o2=$(( _v&7 ))
        _out+="\\\\0\${_o0}\${_o1}\${_o2}"
      fi
      if [[ \${_in[_i+3]} != '=' ]]; then
        _c3=$(( \${_alpha[(i)\${_in[_i+3]}]} - 1 ))
        _v=$(( ((_c2&3)<<6)|_c3 ))
        _o0=$(( _v>>6 )); _o1=$(( (_v>>3)&7 )); _o2=$(( _v&7 ))
        _out+="\\\\0\${_o0}\${_o1}\${_o2}"
      fi
      (( _i += 4 ))
    done
    printf '%b\\n' "\$_out"
  fi
}
`;

// Detect pipeline operator (space | space, excluding || and |& and |>).
function hasPipelineOp(src) {
    return / \| /.test(src);
}

// Transforms `a | b | c` pipelines into sequential temp-file chaining so they work
// without fork(): `{ a } >/tmp/_zpipe_0; { b } </tmp/_zpipe_0 >/tmp/_zpipe_1; { c } </tmp/_zpipe_1`
//
// Tracks quote/bracket depth to skip pipes inside strings and subexpressions.
// Known limits: pipes inside heredoc content and bare case-pattern alternates (a|b) without
// surrounding parens are not detected as non-pipes — both are rare in piping contexts.
//
// fork option: 'simulate' (default, uses this fn) | 'off' (no-op, original behaviour)
//              Future: 'native' for a --with-threads wasm build with real fork().
function simulatePipes(src) {
    const out = [];
    let i = 0, n = src.length;
    let inSQ = false, inDQ = false, depth = 0, pipeCount = 0;
    let buf = [], pipePos = []; // chars for current pipeline group; | offsets within buf

    const flush = (sep) => {
        const s = buf.join('');
        if (!pipePos.length) {
            out.push(s);
        } else {
            const segs = [];
            let prev = 0;
            for (const p of pipePos) { segs.push(s.slice(prev, p).trim()); prev = p + 1; }
            segs.push(s.slice(prev).trim());
            const parts = [];
            for (let k = 0; k < segs.length; k++) {
                const cur   = `/tmp/_zpipe_${pipeCount}`;
                const prev2 = `/tmp/_zpipe_${pipeCount - 1}`;
                if      (k === segs.length - 1) parts.push(`{ ${segs[k]} } <${prev2}`);
                else if (k === 0)               { parts.push(`{ ${segs[k]} } >${cur}`);             pipeCount++; }
                else                            { parts.push(`{ ${segs[k]} } <${prev2} >${cur}`);  pipeCount++; }
            }
            out.push(parts.join('; '));
        }
        if (sep) out.push(sep);
        buf = []; pipePos = [];
    };

    while (i < n) {
        const c = src[i];
        if (inSQ) { buf.push(c); if (c === "'") inSQ = false; i++; continue; }
        if (c === '\\') { buf.push(c, src[i+1] ?? ''); i += 2; continue; }
        if (inDQ) { buf.push(c); if (c === '"') inDQ = false; i++; continue; }
        if (c === "'") { inSQ = true;  buf.push(c); i++; continue; }
        if (c === '"') { inDQ = true;  buf.push(c); i++; continue; }

        // Depth openers/closers — check two-char sequences first.
        if (c === '[' && src[i+1] === '[')               { depth++;              buf.push('[','['); i += 2; continue; }
        if (c === ']' && src[i+1] === ']' && depth > 0)  { depth--;              buf.push(']',']'); i += 2; continue; }
        if (c === '$' && src[i+1] === '(')               { depth++;              buf.push('$','('); i += 2; continue; }
        if (c === '{')                                   { depth++;              buf.push(c);       i++;    continue; }
        if (c === '(' && depth > 0)                      { depth++;              buf.push(c);       i++;    continue; }
        if ((c === ')' || c === '}') && depth > 0)       { depth--;              buf.push(c);       i++;    continue; }
        if (depth > 0) { buf.push(c); i++; continue; }

        // Top-level `(` — subshell or arithmetic `((`.
        if (c === '(') {
            // `((expr))` arithmetic — track as depth, no subshell transform.
            if (src[i+1] === '(') { depth++; buf.push(c); i++; continue; }

            // Determine if this `(` opens a subshell: it must NOT follow an
            // identifier (function call) or `=` (array assignment like `a=(...)`).
            const prevStr  = buf.join('').trimEnd();
            const prevWord = (prevStr.match(/(\w+)$/) ?? ['',''])[1];
            const isArrayAssign = prevStr.endsWith('='); // catches `a=(` and `a+=(`
            const shellKw = new Set(['if','then','else','elif','fi','do','done',
                                     'while','until','for','case','esac','in',
                                     'select','time','!','function']);
            if (!isArrayAssign && (!prevWord || shellKw.has(prevWord))) {
                // Subshell: collect content up to matching `)`, recursively transform, emit `{ ... }`.
                i++; // skip opening `(`
                const ss = i;
                let iDepth = 1, iSQ2 = false, iDQ2 = false;
                while (i < n) {
                    const ic = src[i];
                    if (iSQ2) { if (ic === "'") iSQ2 = false; i++; continue; }
                    if (ic === '\\') { i += 2; continue; }
                    if (iDQ2) { if (ic === '"') iDQ2 = false; i++; continue; }
                    if (ic === "'") { iSQ2 = true;  i++; continue; }
                    if (ic === '"') { iDQ2 = true;  i++; continue; }
                    if (ic === '(' || ic === '{') { iDepth++; i++; continue; }
                    if (ic === ')' || ic === '}') { iDepth--; i++; if (!iDepth) break; continue; }
                    i++;
                }
                const subContent = src.slice(ss, i - 1);
                for (const ch of `{ ${simulatePipes(subContent)} }`) buf.push(ch);
                continue;
            }
            // Not a subshell (e.g. function call `foo(...)`): treat as normal depth opener.
            depth++; buf.push(c); i++; continue;
        }

        // Top-level pipe / boundary detection.
        if (c === '|') {
            const nx = src[i+1];
            if (nx === '|') { flush('||'); i += 2; continue; }
            if (nx === '&') { flush('|&'); i += 2; continue; }
            pipePos.push(buf.length); buf.push(c); i++; continue;
        }
        if (c === ';' || c === '\n')       { flush(c);    i++;    continue; }
        if (c === '&' && src[i+1] === '&') { flush('&&'); i += 2; continue; }
        if (c === '&')                     { flush(c);    i++;    continue; }
        buf.push(c); i++;
    }
    flush('');
    return out.join('');
}

// Pool of pre-warmed Web Workers. Each worker holds a fully initialized wasm
// module ready to run a script immediately. After each run the worker begins
// pre-initializing the next module, overlapping init with the caller's read time.
class WorkerPool {
    #ready   = []; // idle workers with a warm module
    #pending = []; // queued { src, stdin, fs, resolve, reject }
    #all     = []; // every spawned worker (for shutdown)

    constructor(size = 1) {
        for (let i = 0; i < size; i++) this.#spawn();
    }

    #spawn() {
        const w = new Worker(new URL('./zsh-worker.js', import.meta.url));
        this.#all.push(w);
        w.onmessage = ({ data }) => {
            if (data.type === 'ready') {
                // Worker finished pre-initializing — dispatch a queued job or park it.
                if (this.#pending.length > 0) {
                    this.#dispatch(w, this.#pending.shift());
                } else {
                    this.#ready.push(w);
                }
            } else if (data.type === 'result') {
                const job = w._job;
                w._job = null;
                let { stdout, stderr, exitCode } = data;
                // Only inject the helpful pipe diagnostic when simulation is off and
                // the script had a pipeline but produced no output at all.
                if (!stdout && !stderr && job.fork === 'off' && hasPipelineOp(job.src)) {
                    stderr = 'zsh-wasm: pipes require fork(), which is not available in WebAssembly.\n' +
                             '  Use here-strings or heredocs instead of pipelines.\n' +
                             "  Example: bc <<< '1+1'  (not: echo '1+1' | bc)";
                }
                job.resolve({ stdout, stderr, exitCode });
                // Worker will send 'ready' once its next pre-init completes.
            }
        };
        w.onerror = (e) => {
            const job = w._job;
            if (job) { job.reject(e); w._job = null; }
        };
    }

    #dispatch(worker, job) {
        worker._job = job;
        const src = job.fork !== 'off' ? simulatePipes(job.src) : job.src;
        worker.postMessage({
            type: 'run',
            src: BUILTINS_PREAMBLE + src + '\n',
            fs: job.fs ?? ZSH_FS,
            idbfsMount: IDBFS_MOUNT,
            stdin: job.stdin ?? null,
        });
    }

    run(src, { stdin = null, fs = null, fork = 'simulate' } = {}) {
        return new Promise((resolve, reject) => {
            const job = { src, stdin, fs, fork, resolve, reject };
            if (this.#ready.length > 0) {
                this.#dispatch(this.#ready.shift(), job);
            } else {
                this.#pending.push(job);
            }
        });
    }

    shutdown() {
        for (const w of this.#all) w.terminate();
        this.#all = [];
        this.#ready = [];
        for (const job of this.#pending) job.reject(new Error('WorkerPool shut down'));
        this.#pending = [];
    }
}

// Lazy default pool — created on first runZshScript() call.
let _defaultPool = null;

export function runZshScript(src, { stdin = null, fs = null, fork = 'simulate' } = {}) {
    if (!_defaultPool) _defaultPool = new WorkerPool(1);
    return _defaultPool.run(src, { stdin, fs, fork });
}

/** Create a pool of pre-warmed workers. Call pool.run(src, opts) and pool.shutdown(). */
export function createPool(size = 1) {
    return new WorkerPool(size);
}

/** Terminate the default pool used by runZshScript(). */
export function shutdownDefaultPool() {
    _defaultPool?.shutdown();
    _defaultPool = null;
}
