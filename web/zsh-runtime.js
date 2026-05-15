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

export const ZSH_FS = (window.ZshWasmConfig?.fs ?? 'memfs').toLowerCase();
export const IDBFS_MOUNT = '/home/user';

export const BUILTINS_PREAMBLE = `\
touch() { local f; for f; do : >> "$f"; done }
cat()   { local f; for f; do print -r -- "$(<$f)"; done }
wc() {
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    printf '%7d %s\\n' \${#lines} "$f"
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
  local pat=$1; shift
  local f
  for f; do
    local -a lines=("\${(@f)$(<$f)}")
    local line
    for line in $lines; do
      [[ $line =~ $pat ]] && print -- "$line"
    done
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
  local rev=0 num=0 uniq_flag=0
  local -a args
  for a; do
    if [[ $a == -* ]]; then
      [[ $a == *r* ]] && rev=1
      [[ $a == *n* ]] && num=1
      [[ $a == *u* ]] && uniq_flag=1
    else
      args+=($a)
    fi
  done
  local -a lines
  local f
  for f in $args; do lines+=("\${(@f)$(<$f)}"); done
  if   (( num && rev )); then lines=("\${(@On)lines}")
  elif (( num ));        then lines=("\${(@on)lines}")
  elif (( rev ));        then lines=("\${(@O)lines}")
  else                        lines=("\${(@o)lines}")
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
  local delim=$'\\t' fields=''
  local -a args
  while (( $# )); do
    case $1 in
      -d)  shift; delim=$1 ;;
      -d*) delim=\${1#-d} ;;
      -f)  shift; fields=$1 ;;
      -f*) fields=\${1#-f} ;;
      -*)  ;;
      *)   args+=($1) ;;
    esac
    shift
  done
  local sep=$'\\x01'
  local f
  for f in $args; do
    local -a lines=("\${(@f)$(<$f)}")
    local line
    for line in "\${(@)lines}"; do
      local -a parts=("\${(@s[$sep])\${line//\$delim/\$sep}}")
      local -a out
      local fspec
      for fspec in \${(s:,:)fields}; do
        if [[ $fspec == *-* ]]; then
          local s=\${fspec%-*} e=\${fspec#*-}
          [[ -z $s ]] && s=1
          [[ -z $e ]] && e=\${#parts}
          out+=("\${(@)parts[$s,$e]}")
        else
          out+=("\${parts[$fspec]}")
        fi
      done
      print -- "\${(j[$delim])out}"
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
`;

// Runs a zsh script and returns { stdout, stderr } as plain strings.
export async function runZshScript(src) {
    const outLines = [];
    const errLines = [];
    const opts = {
        noInitialRun: true,
        print:    txt => outLines.push(txt),
        printErr: txt => { if (!isRuntimeNoise(txt)) errLines.push(txt); },
    };

    const module = await createZshModule(opts);

    if (ZSH_FS === 'idbfs') {
        try { module.FS.mkdir('/home'); } catch(e) {}
        try { module.FS.mkdir(IDBFS_MOUNT); } catch(e) {}
        module.FS.mount(module.FS.filesystems['IDBFS'], {}, IDBFS_MOUNT);
        await new Promise((res, rej) =>
            module.FS.syncfs(true, err => err ? rej(err) : res()));
    }

    module.FS.writeFile('/script', BUILTINS_PREAMBLE + src + '\n');
    module.callMain(['/script']);

    if (ZSH_FS === 'idbfs') {
        await new Promise((res, rej) =>
            module.FS.syncfs(false, err => err ? rej(err) : res()));
    }

    return {
        stdout: outLines.join('\n'),
        stderr: errLines.join('\n'),
    };
}
