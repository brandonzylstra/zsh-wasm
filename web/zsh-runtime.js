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
# Split TEXT into lines in the array named by ARRAY.
# Two ways a plain (@f) split produces a line that was never there: splitting the
# empty string yields one empty element, and a trailing newline yields an empty
# last element. Either one shows up as a stray blank line of output, which is
# how 'printf "" | sort' came to print a newline.
_zw_split_lines() { setopt localoptions noerrexit;
  local -a _zw_parts
  [[ -n $2 ]] && _zw_parts=("\${(@f)\${2%$'\\n'}}")
  set -A $1 "\${(@)_zw_parts}"
}
grep() { setopt localoptions noerrexit;
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
      IFS= read -r -d '' _stdin || true
      _zw_split_lines lines "$_stdin"
    else
      _zw_split_lines lines "$(<$_src)"
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
cp() { setopt localoptions noerrexit; print -r -- "$(<$1)" > "$2" }
mv() { setopt localoptions noerrexit; cp "$1" "$2" && zf_rm "$1" }
date() { setopt localoptions noerrexit;
  zmodload zsh/datetime 2>/dev/null
  local fmt='%a %b %e %H:%M:%S %z %Y'
  [[ \${1-} == +* ]] && fmt=\${1#+}

  if [[ -z \${TZ-} ]]; then
    strftime $fmt $EPOCHSECONDS
    return
  fi

  # Parse TZ into a signed UTC offset in seconds.
  # UTC+5 = 5 hours ahead of UTC (intuitive convention, not POSIX).
  # Supports: UTC, UTC0, UTC±H, UTC±H:MM, ±HH:MM, ±HHMM
  local _tz_off=0 _sign _h _m
  if [[ $TZ == UTC || $TZ == UTC0 || $TZ == UTC+0 || $TZ == UTC-0 ]]; then
    _tz_off=0
  elif [[ $TZ =~ '^UTC([+-])([0-9]{1,2})(:([0-9]{2}))?$' ]]; then
    _sign=\${match[1]} _h=\${match[2]} _m=\${match[4]:-0}
    _tz_off=$(( _h * 3600 + _m * 60 ))
    [[ $_sign == '-' ]] && _tz_off=$(( -_tz_off ))
  elif [[ $TZ =~ '^([+-])([0-9]{1,2}):?([0-9]{2})$' ]]; then
    _sign=\${match[1]} _h=\${match[2]} _m=\${match[3]}
    _tz_off=$(( _h * 3600 + _m * 60 ))
    [[ $_sign == '-' ]] && _tz_off=$(( -_tz_off ))
  else
    print -u2 "date: TZ=$TZ: named timezones are not supported in zsh-wasm (no tzdata); using browser local time"
    strftime $fmt $EPOCHSECONDS
    return
  fi

  # _ZW_LOCAL_TZ_SECS is injected by the JS runtime as -getTimezoneOffset()*60.
  local _loff=\${_ZW_LOCAL_TZ_SECS:-0}
  local _adj=$(( EPOCHSECONDS + _tz_off - _loff ))

  # Build %z replacement string (e.g. +0530 or -0800).
  local _tsign='+'; (( _tz_off < 0 )) && _tsign='-'
  local _tabs=$(( _tz_off < 0 ? -_tz_off : _tz_off ))
  local _thh=$(( _tabs / 3600 )) _tmm=$(( (_tabs % 3600) / 60 ))
  local _thhs="\${_thh}" _tmms="\${_tmm}"
  (( _thh < 10 )) && _thhs="0\${_thh}"
  (( _tmm < 10 )) && _tmms="0\${_tmm}"
  local _tzstr="\${_tsign}\${_thhs}\${_tmms}"

  # Replace %z with a placeholder. In zsh \${var//pattern/rep}, leading % is an
  # end-anchor, so we escape it: \\%z matches the literal two chars %z.
  local _pfmt=\${fmt//\\%z/__TZSUB__}
  local _out
  _out=$(strftime "$_pfmt" $_adj)
  print -- \${_out//__TZSUB__/$_tzstr}
}
sleep() { setopt localoptions noerrexit; printf '%s' "\${1:-0}" > /dev/wasm_sleep }
xargs() { setopt localoptions noerrexit;
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
  IFS= read -r -d '' _stdin || true
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
find() { setopt localoptions noerrexit;
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
rm() { setopt localoptions noerrexit;
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
env() { setopt localoptions noerrexit;
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
    return 0   # not the status of the last [[ ]] test
  fi
  for _a in "\${(@)_unset}"; do unset "$_a"; done
  for _a in "\${(@)_vars}"; do
    _k=\${_a%%=*}; _v=\${_a#*=}
    export "$_k=$_v"
  done
  "\${_cmd[@]}"
}
which() { setopt localoptions noerrexit;
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
realpath() { setopt localoptions noerrexit;
  local _f
  for _f; do print -- \${_f:A}; done
}
ln() { setopt localoptions noerrexit;
  local _sym=0 _force=0
  local -a _flags
  while [[ \${1-} == -* ]]; do
    [[ $1 == *s* ]] && _sym=1
    [[ $1 == *f* ]] && _force=1
    shift
  done
  # zf_ln -s, not zf_symlink: the latter kills the whole script in this build.
  (( _sym ))   && _flags+=(-s)
  (( _force )) && _flags+=(-f)
  zf_ln \$_flags $1 $2
}
base64() { setopt localoptions noerrexit;
  local _d=0
  [[ \${1-} == -d || \${1-} == --decode ]] && { _d=1; shift; }
  local _alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  local _in _out='' _i _len _b0 _b1 _b2 _v
  IFS= read -r -d '' _in || true
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
_zw_stub() { setopt localoptions noerrexit;
  print -u2 "zsh-wasm: '\${funcstack[2]}' is not available — $1"
  return 127
}
curl()    { setopt localoptions noerrexit; _zw_stub 'no network access in zsh-wasm. Pass data via the stdin option.' }
wget()    { setopt localoptions noerrexit; _zw_stub 'no network access in zsh-wasm. Pass data via the stdin option.' }
git()     { setopt localoptions noerrexit; _zw_stub 'requires a real filesystem and network; not available in wasm.' }
python()  { setopt localoptions noerrexit; _zw_stub 'Python is not available; zsh-wasm runs zsh scripts only.' }
python3() { setopt localoptions noerrexit; _zw_stub 'Python is not available; zsh-wasm runs zsh scripts only.' }
python2() { setopt localoptions noerrexit; _zw_stub 'Python is not available; zsh-wasm runs zsh scripts only.' }
ruby()    { setopt localoptions noerrexit; _zw_stub 'Ruby is not available; zsh-wasm runs zsh scripts only.' }
perl()    { setopt localoptions noerrexit; _zw_stub 'Perl is not available; zsh-wasm runs zsh scripts only.' }
node()    { setopt localoptions noerrexit; _zw_stub 'Node.js is not available inside the wasm worker.' }
npm()     { setopt localoptions noerrexit; _zw_stub 'npm is not available inside the wasm worker.' }
docker()  { setopt localoptions noerrexit; _zw_stub 'Docker requires a host OS kernel — not possible in wasm.' }
ssh()     { setopt localoptions noerrexit; _zw_stub 'no network access in zsh-wasm.' }
sudo()    { setopt localoptions noerrexit; _zw_stub 'privilege escalation is not possible in the wasm sandbox.' }
tar()     { setopt localoptions noerrexit; _zw_stub 'tar is not shimmed. Use zsh glob expansion or cp/mv instead.' }
gzip()    { setopt localoptions noerrexit; _zw_stub 'compression is not supported in zsh-wasm.' }
make()    { setopt localoptions noerrexit; _zw_stub 'make is not available; only zsh builtins and shimmed commands run in wasm.' }
gcc()     { setopt localoptions noerrexit; _zw_stub 'compilers are not available in zsh-wasm.' }
clang()   { setopt localoptions noerrexit; _zw_stub 'compilers are not available in zsh-wasm.' }
vim()     { setopt localoptions noerrexit; _zw_stub 'interactive editors are not available in zsh-wasm (no terminal).' }
vi()      { setopt localoptions noerrexit; _zw_stub 'interactive editors are not available in zsh-wasm (no terminal).' }
nano()    { setopt localoptions noerrexit; _zw_stub 'interactive editors are not available in zsh-wasm (no terminal).' }
less()    { setopt localoptions noerrexit; _zw_stub 'pagers require an interactive terminal — not available in zsh-wasm.' }
more()    { setopt localoptions noerrexit; _zw_stub 'pagers require an interactive terminal — not available in zsh-wasm.' }
man()     { setopt localoptions noerrexit; _zw_stub 'man pages are not available in zsh-wasm.' }
ping()    { setopt localoptions noerrexit; _zw_stub 'no network access in zsh-wasm.' }
`;

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
                if (w._timer) { clearTimeout(w._timer); w._timer = null; }
                const { stdout, stderr, exitCode } = data;
                job.resolve({ stdout, stderr, exitCode });
                // Worker will send 'ready' once its next pre-init completes.
            }
        };
        w.onerror = (e) => {
            const job = w._job;
            if (w._timer) { clearTimeout(w._timer); w._timer = null; }
            if (job) { job.reject(e); w._job = null; }
        };
    }

    // Terminate a wedged/broken worker and spawn a replacement so the pool keeps
    // its capacity. A terminated worker never sends 'ready', so without this a
    // single hanging script (e.g. a tool that blocks on stdin) would freeze every
    // later run behind the one stuck worker.
    #retire(worker) {
        worker.terminate();
        this.#all   = this.#all.filter(w => w !== worker);
        this.#ready = this.#ready.filter(w => w !== worker);
        this.#spawn();
    }

    #dispatch(worker, job) {
        worker._job = job;
        const localTzOffSec = -new Date().getTimezoneOffset() * 60;
        worker._timer = setTimeout(() => {
            const stuck = worker._job;
            worker._job = null;
            worker._timer = null;
            this.#retire(worker);
            if (stuck) stuck.reject(new Error(
                `zsh-wasm: script timed out after ${Math.round(job.timeoutMs / 1000)}s — ` +
                'likely an infinite loop, or a command waiting on input that never arrives. ' +
                'The worker was restarted.'));
        }, job.timeoutMs);
        worker.postMessage({
            type: 'run',
            src: `_ZW_LOCAL_TZ_SECS=${localTzOffSec}\n` + BUILTINS_PREAMBLE + job.src + '\n',
            fs: job.fs ?? ZSH_FS,
            idbfsMount: IDBFS_MOUNT,
            stdin: job.stdin ?? null,
            busySleepFallback: job.busySleepFallback ?? false,
        });
    }

    run(src, { stdin = null, fs = null, busySleepFallback = false, timeoutMs = 30000 } = {}) {
        return new Promise((resolve, reject) => {
            const job = { src, stdin, fs, busySleepFallback, timeoutMs, resolve, reject };
            if (this.#ready.length > 0) {
                this.#dispatch(this.#ready.shift(), job);
            } else {
                this.#pending.push(job);
            }
        });
    }

    shutdown() {
        for (const w of this.#all) { if (w._timer) clearTimeout(w._timer); w.terminate(); }
        this.#all = [];
        this.#ready = [];
        for (const job of this.#pending) job.reject(new Error('WorkerPool shut down'));
        this.#pending = [];
    }
}

// Lazy default pool — created on first runZshScript() call.
let _defaultPool = null;

export function runZshScript(src, { stdin = null, fs = null, busySleepFallback = false, timeoutMs = 30000 } = {}) {
    if (!_defaultPool) _defaultPool = new WorkerPool(1);
    return _defaultPool.run(src, { stdin, fs, busySleepFallback, timeoutMs });
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
