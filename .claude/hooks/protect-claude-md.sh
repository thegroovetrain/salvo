#!/usr/bin/env bash
# PreToolUse hook: hard moratorium on editing CLAUDE.md.
#
# Eric's ruling (2026-09-14): CLAUDE.md is frozen. CLAUDE.md is "context, not
# enforced configuration", so the freeze is enforced here rather than by asking
# the model nicely. Only Eric lifts it: launch Claude with
# HC_UNLOCK_CLAUDE_MD=1, or remove the hook from .claude/settings.json.
#
# Contract (code.claude.com/docs/en/hooks): JSON arrives on stdin with
# tool_name and tool_input; exit 2 blocks the tool call and stderr is shown as
# the reason; exit 0 means "no decision". Anything unparsable fails OPEN so a
# malformed payload can never break an unrelated tool call -- with ONE
# exception: a file tool whose path could not be extracted while the raw
# payload still names a protected file fails CLOSED, because that combination
# can only be a protected write the parser did not understand.
#
# SCOPE, STATED HONESTLY. This hook stops DIRECT edits: it is a tripwire, not a
# wall against deliberate evasion. It reads one command string, so anything
# that hides the target from that string still gets through -- variable
# indirection (`p=CLAUDE; echo x > ${p}.md`), symlinks, a script file whose
# CONTENTS never appear in the command, `git reset --hard` / `git checkout --
# .` with no path named, and any interpreter reading its program from stdin.
# The candidate hard stop (a content-based PostToolUse check) was NOT adopted;
# see deferred-work.md for why. Do not read a passing command as "this cannot
# touch CLAUDE.md".
#
# Analysis method (Bash arm): the command is lowercased and then TOKENIZED by a
# small quote-aware scanner, so that
#   * a redirect only counts when its TARGET names a protected file
#     (`git commit -m "... CLAUDE.md ... <noreply@x>"` is not a write), and
#   * a writer verb only counts when it is in COMMAND POSITION of its own
#     segment -- the first word after any leading `NAME=value` assignments and
#     any wrapper (`sudo`, `env`, `xargs`, ...) -- and a protected file is in
#     THAT command's argument list, up to the next unquoted `|`, `;`, `&&`,
#     `||`. So `npm install --include=dev && cat CLAUDE.md` is not a write and
#     neither is `grep -n touch CLAUDE.md`, while `sudo rm CLAUDE.md` and
#     `ls | xargs rm CLAUDE.md` are; and
#   * quoting/escaping cannot spell the name past the test
#     (`CLAUDE'.'md`, `C\LAUDE.md`), because tokens are unquoted before the
#     name test.
# If the command's quoting is unbalanced the scanner re-runs quote-blind, which
# is the conservative direction. Accepted over-breadth: an interpreter or
# archiver that merely READS the file in its own argument list is denied
# (`awk '{print}' CLAUDE.md`, `cp CLAUDE.md CLAUDE.local.md`); use Read, cat,
# grep, head, wc, sed -n or git diff/log/show instead.
#
# The hook also protects ITSELF: .claude/hooks/, .claude/settings.json, and any
# tool payload naming HC_UNLOCK_CLAUDE_MD (Eric sets that at launch, never
# through a tool). .claude/settings.local.json is NOT path-protected -- Eric's
# permission edits live there -- but its CONTENT is, by that same payload rule.
#
# Targets bash 3.2 (macOS /bin/bash): no ${var,,}, no associative arrays, and
# deliberately no here-strings, heredocs or temp files anywhere (a here-string
# needs a writable temp dir; where that fails the hook would fail OPEN on a
# protected write).

set -u

DENY_MSG="CLAUDE.md is frozen (Eric's moratorium, 2026-09-14): no edits without his explicit instruction. Only Eric lifts it - launch Claude with HC_UNLOCK_CLAUDE_MD=1 or remove the hook from .claude/settings.json. Put agent rules in _bmad-output/project-context.md or auto-memory instead."
DENY_SELF_MSG="The CLAUDE.md moratorium hook protects itself: .claude/hooks/, .claude/settings.json and HC_UNLOCK_CLAUDE_MD may not be written by an agent. Only Eric changes them."

deny_md() {
  printf '%s\n' "$DENY_MSG" >&2
  exit 2
}

deny_self() {
  printf '%s\n' "$DENY_SELF_MSG" >&2
  exit 2
}

lc() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# Normalize an ALREADY-LOWERCASED string for name tests, in pure bash (this
# runs per token, so it must not fork): drop the three characters shell quoting
# can scatter through a filename, then blank out the personal escape hatch.
NW=""
nw_of() {
  local s="$1"
  s=${s//\'/}
  s=${s//\"/}
  s=${s//\\/}
  NW=${s//claude.local.md/ }
}

# --- name tests ($1 must already be through nw_of) -------------------------
is_md_target() {
  case "$1" in
    *claude.md*) return 0 ;;
  esac
  return 1
}

is_self_target() {
  case "$1" in
    *protect-claude-md*) return 0 ;;
    *.claude/settings.json*) return 0 ;;
    *.claude/hooks*) return 0 ;;
  esac
  return 1
}

is_any_target() {
  is_md_target "$1" && return 0
  is_self_target "$1" && return 0
  return 1
}

# 1. Eric's unlock (environment only -- never reachable from a tool payload).
if [ "${HC_UNLOCK_CLAUDE_MD:-}" = "1" ]; then
  exit 0
fi

# 2. Slurp stdin (builtin read: no external command needed).
input=""
IFS= read -r -d '' input || true
[ -n "$input" ] || exit 0

low_input=$(lc "$input")
nw_of "$low_input"
raw_norm="$NW"

# 3. Self-protection, EVERY tool: a payload naming the unlock variable is an
#    attempt to arm it. Eric sets it at launch; a tool never needs to.
case "$raw_norm" in
  *hc_unlock_claude_md*) deny_self ;;
esac

# 4. Fast path. Every deny below needs a protected name SOMEWHERE in the
#    payload, so a payload naming none of them cannot deny -- leave before
#    spawning a parser. This is the overwhelmingly common call and it must not
#    cost a python3 startup. The one way a name could hide from the raw text is
#    a JSON \uXXXX escape (Claude Code's serializer never emits one for ASCII),
#    so that case falls through to the full parse instead.
if ! is_any_target "$raw_norm"; then
  case "$low_input" in
    *'\u'*) ;;
    *) exit 0 ;;
  esac
fi

tool_name=""
path_val=""
cmd_val=""
parsed=0
US=$(printf '\037')

# 5a. Preferred parser: python3. The three fields are joined with the unit
#     separator and split with parameter expansion -- no here-string, so no
#     writable temp dir is ever required.
if command -v python3 >/dev/null 2>&1; then
  fields=$(printf '%s' "$input" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(3)
if not isinstance(d, dict):
    sys.exit(3)
ti = d.get("tool_input")
if not isinstance(ti, dict):
    ti = {}
def s(v):
    if not isinstance(v, str):
        return ""
    out = []
    for ch in v:
        if ch in "\r\n\x1f":
            out.append(" ")
        else:
            out.append(ch)
    return "".join(out)
p = s(ti.get("file_path")) or s(ti.get("notebook_path"))
sys.stdout.write(s(d.get("tool_name")) + "\x1f" + p + "\x1f" + s(ti.get("command")) + "\x1f")
' 2>/dev/null)
  py_rc=$?
  if [ "$py_rc" -eq 0 ]; then
    case "$fields" in
      *"$US"*)
        tool_name=${fields%%$US*}
        rest=${fields#*$US}
        path_val=${rest%%$US*}
        rest=${rest#*$US}
        cmd_val=${rest%%$US*}
        parsed=1
        ;;
    esac
  fi
fi

# 5b. Fallback parser: grep/sed over the raw JSON.
json_str_field() {
  printf '%s' "$2" \
    | grep -Eo "\"$1\"[[:space:]]*:[[:space:]]*\"(\\\\.|[^\"\\\\])*\"" \
    | head -1 \
    | sed -E 's/^"[^"]*"[[:space:]]*:[[:space:]]*"//; s/"$//'
}

if [ "$parsed" -eq 0 ]; then
  flat=$(printf '%s' "$input" | tr '\n\r' '  ')
  case "$flat" in
    *'"tool_name"'*) ;;
    *) exit 0 ;;
  esac
  tool_name=$(json_str_field tool_name "$flat")
  path_val=$(json_str_field file_path "$flat")
  [ -n "$path_val" ] || path_val=$(json_str_field notebook_path "$flat")
  cmd_val=$(json_str_field command "$flat")
fi

[ -n "$tool_name" ] || exit 0

# --- file-tool arm ---------------------------------------------------------
# A CLAUDE.md outside this project (Eric's user-level ~/.claude/CLAUDE.md) is
# not ours to freeze. Worktrees live under <project>/.claude/worktrees/, so the
# prefix test keeps them covered.
in_project_scope() { # $1 = lowercased path
  local proj
  case "$1" in
    /*) ;;
    *) return 0 ;;                 # relative path -> ours
  esac
  proj=${CLAUDE_PROJECT_DIR:-}
  [ -n "$proj" ] || return 0       # no project dir declared -> be conservative
  proj=$(lc "$proj")
  while :; do
    case "$proj" in
      */) proj=${proj%/} ;;
      *) break ;;
    esac
  done
  [ -n "$proj" ] || return 0
  case "$1" in
    "$proj"/*) return 0 ;;
  esac
  return 1
}

file_tool_arm() {
  local lpath base
  [ -n "$path_val" ] || return 0
  lpath=$(lc "$path_val")
  in_project_scope "$lpath" || return 0
  case "$lpath" in
    */.claude/hooks/*|.claude/hooks/*) deny_self ;;
    */.claude/settings.json|.claude/settings.json) deny_self ;;
  esac
  base=${lpath##*/}
  if [ "$base" = "claude.md" ]; then
    deny_md
  fi
  return 0
}

# --- Bash arm: tokenizer ---------------------------------------------------
TOK_TEXT=()
TOK_KIND=()
TOK_UNBALANCED=0

tok_push() { # $1 = text, $2 = kind
  TOK_TEXT[${#TOK_TEXT[@]}]="$1"
  TOK_KIND[${#TOK_KIND[@]}]="$2"
}

tokenize() { # $1 = lowercased command, $2 = "1" to ignore quoting entirely
  local s="$1" blind="$2"
  local n=${#s}
  local i=0 ch c2 q="" cur="" started=0 op=""
  TOK_TEXT=()
  TOK_KIND=()
  TOK_UNBALANCED=0
  while [ "$i" -lt "$n" ]; do
    ch=${s:$i:1}
    if [ -n "$q" ]; then
      if [ "$ch" = "$q" ]; then q=""; else cur="$cur$ch"; fi
      started=1
      i=$((i + 1))
      continue
    fi
    case "$ch" in
      "'"|'"')
        if [ "$blind" = "1" ]; then cur="$cur$ch"; else q="$ch"; fi
        started=1
        i=$((i + 1))
        ;;
      '\')
        i=$((i + 1))
        if [ "$i" -lt "$n" ]; then
          cur="$cur${s:$i:1}"
          i=$((i + 1))
        fi
        started=1
        ;;
      ' '|$'\t'|$'\n'|$'\r')
        if [ "$started" -eq 1 ]; then tok_push "$cur" w; cur=""; started=0; fi
        i=$((i + 1))
        ;;
      '>'|'<'|'|'|'&'|';'|'('|')')
        if [ "$started" -eq 1 ]; then tok_push "$cur" w; cur=""; started=0; fi
        op=""
        while [ "$i" -lt "$n" ]; do
          c2=${s:$i:1}
          case "$c2" in
            '>'|'<'|'|'|'&'|';'|'('|')') op="$op$c2"; i=$((i + 1)) ;;
            *) break ;;
          esac
        done
        tok_push "$op" o
        ;;
      *)
        cur="$cur$ch"
        started=1
        i=$((i + 1))
        ;;
    esac
  done
  if [ "$started" -eq 1 ]; then tok_push "$cur" w; fi
  [ -z "$q" ] || TOK_UNBALANCED=1
}

# Writer verbs. Each is TARGET-SCOPED and COMMAND-POSITION-ONLY: it denies only
# when it is the command its segment actually RUNS and a protected file is in
# that command's own argument list. A verb word appearing as an ARGUMENT is not
# a write -- `grep -n install CLAUDE.md` greps, it does not install.
is_writer_verb() {
  case "$1" in
    cp|mv|rm|ln|dd|install|patch|truncate|touch|chmod) return 0 ;;
    tee|sponge|unlink|shred|rsync|curl|wget) return 0 ;;
    python|python3|node|ruby|perl|awk|bun|deno|npx|tsx) return 0 ;;
    ex|vi|vim|nvim|ed) return 0 ;;
    unzip|tar|gsed) return 0 ;;
  esac
  return 1
}

# `git stash` / `git reset` deny only when the segment names the file; a bare
# `git reset --hard` is out of scope (ledgered in deferred-work.md).
is_git_write_sub() {
  case "$1" in
    checkout|restore|apply|revert|rm|mv|stash|reset) return 0 ;;
  esac
  return 1
}

# git options that consume the FOLLOWING token as their value.
git_opt_takes_arg() {
  case "$1" in
    -c|--exec-path|--git-dir|--work-tree|--namespace|--super-prefix) return 0 ;;
  esac
  return 1
}

# Wrappers that run ANOTHER command: the real verb is what follows them.
is_cmd_wrapper() {
  case "$1" in
    sudo|doas|env|command|exec|nohup|time|nice|caffeinate|xargs|builtin) return 0 ;;
  esac
  return 1
}

# CMD_AT = index of the token in COMMAND POSITION for a segment: the first word
# after any leading NAME=value assignments, any command wrappers and their
# options, and any leading redirection. -1 when the segment runs nothing.
CMD_AT=-1
segment_command_index() { # $1 = from, $2 = one-past-last
  local k="$1" to="$2" t moved=0
  CMD_AT=-1
  while [ "$k" -lt "$to" ]; do
    if [ "${TOK_KIND[$k]}" = "o" ]; then
      case "${TOK_TEXT[$k]}" in
        *'<'*|*'>'*)
          k=$((k + 1))
          if [ "$k" -lt "$to" ] && [ "${TOK_KIND[$k]}" = "w" ]; then k=$((k + 1)); fi
          ;;
        *) k=$((k + 1)) ;;
      esac
      moved=1
      continue
    fi
    t="${TOK_TEXT[$k]}"
    case "$t" in
      [a-z_]*=*) k=$((k + 1)); moved=1; continue ;;
    esac
    if is_cmd_wrapper "$t"; then
      k=$((k + 1))
      moved=1
      continue
    fi
    case "$t" in
      -*)
        if [ "$moved" -eq 1 ]; then k=$((k + 1)); continue; fi
        ;;
    esac
    CMD_AT="$k"
    return 0
  done
  return 0
}

# sed/gsed in-place flag in ANY position: -i, -ni, -Ei, -i.bak, -i'' (already
# unquoted to -i), --in-place, --in-place=.bak.
is_inplace_flag() {
  local rest c
  case "$1" in
    --in-place|--in-place=*) return 0 ;;
    --*) return 1 ;;
    -?*) ;;
    *) return 1 ;;
  esac
  rest=${1#-}
  while [ -n "$rest" ]; do
    c=${rest:0:1}
    case "$c" in
      i) return 0 ;;
      [a-z]) rest=${rest:1} ;;
      *) return 1 ;;
    esac
  done
  return 1
}

# A split point between one command and the next. Operator runs are made only
# of < > | & ; ( ) -- a REDIRECT always contains < or >, so anything without
# one is a separator.
is_splitter() {
  case "$1" in
    ''|*'<'*|*'>'*) return 1 ;;
  esac
  return 0
}

# $1 = first token index, $2 = one-past-last token index
check_segment() {
  local from="$1" to="$2"
  local k t cmd_tok=""
  local md_hit=0 self_hit=0 verb_hit=0
  local find_at=-1

  k="$from"
  while [ "$k" -lt "$to" ]; do
    if [ "${TOK_KIND[$k]}" = "w" ]; then
      t="${TOK_TEXT[$k]}"
      nw_of "$t"
      is_md_target "$NW" && md_hit=1
      is_self_target "$NW" && self_hit=1
      if [ "$find_at" -lt 0 ] && [ "$t" = "find" ]; then find_at="$k"; fi
    fi
    k=$((k + 1))
  done

  if [ "$md_hit" -eq 0 ] && [ "$self_hit" -eq 0 ]; then
    return 0
  fi

  # The verb that actually RUNS this segment. A verb word sitting in an
  # argument list (`grep -n touch CLAUDE.md`) is not a write.
  segment_command_index "$from" "$to"
  if [ "$CMD_AT" -ge 0 ]; then
    cmd_tok="${TOK_TEXT[$CMD_AT]}"
    is_writer_verb "$cmd_tok" && verb_hit=1
  fi

  # sed/gsed/perl with an in-place flag, only when it is the command run.
  if [ "$verb_hit" -eq 0 ] && [ -n "$cmd_tok" ]; then
    case "$cmd_tok" in
      sed|gsed|perl)
        k=$((CMD_AT + 1))
        while [ "$k" -lt "$to" ]; do
          if [ "${TOK_KIND[$k]}" = "w" ] && is_inplace_flag "${TOK_TEXT[$k]}"; then
            verb_hit=1
            break
          fi
          k=$((k + 1))
        done
        ;;
    esac
  fi

  # find ... -delete / -exec (matched anywhere in the segment, by ruling)
  if [ "$verb_hit" -eq 0 ] && [ "$find_at" -ge 0 ]; then
    k=$((find_at + 1))
    while [ "$k" -lt "$to" ]; do
      if [ "${TOK_KIND[$k]}" = "w" ]; then
        case "${TOK_TEXT[$k]}" in
          -delete|-exec|-execdir|-ok) verb_hit=1; break ;;
        esac
      fi
      k=$((k + 1))
    done
  fi

  # git [options] <write-subcommand>, only when git is the command run.
  if [ "$verb_hit" -eq 0 ] && [ "$cmd_tok" = "git" ]; then
    k=$((CMD_AT + 1))
    while [ "$k" -lt "$to" ]; do
      if [ "${TOK_KIND[$k]}" = "w" ]; then
        t="${TOK_TEXT[$k]}"
        if git_opt_takes_arg "$t"; then
          k=$((k + 2))
          continue
        fi
        case "$t" in
          -*) ;;
          *)
            is_git_write_sub "$t" && verb_hit=1
            break
            ;;
        esac
      fi
      k=$((k + 1))
    done
  fi

  [ "$verb_hit" -eq 1 ] || return 0
  [ "$md_hit" -eq 1 ] && deny_md
  deny_self
}

bash_arm() {
  local lower count i j seg_start
  [ -n "$cmd_val" ] || return 0
  lower=$(lc "$cmd_val")
  nw_of "$lower"
  # Naming nothing protected is the overwhelmingly common case: leave early.
  is_any_target "$NW" || return 0

  tokenize "$lower" 0
  if [ "$TOK_UNBALANCED" -eq 1 ]; then
    tokenize "$lower" 1
  fi

  count=${#TOK_TEXT[@]}
  [ "$count" -gt 0 ] || return 0

  # --- redirect rule: an operator containing '>' whose TARGET is protected.
  i=0
  while [ "$i" -lt "$count" ]; do
    if [ "${TOK_KIND[$i]}" = "o" ]; then
      case "${TOK_TEXT[$i]}" in
        *'>'*)
          j=$((i + 1))
          if [ "$j" -lt "$count" ] && [ "${TOK_KIND[$j]}" = "w" ]; then
            nw_of "${TOK_TEXT[$j]}"
            is_md_target "$NW" && deny_md
            is_self_target "$NW" && deny_self
          fi
          ;;
      esac
    fi
    i=$((i + 1))
  done

  # --- verb rule, one segment at a time.
  seg_start=0
  i=0
  while [ "$i" -le "$count" ]; do
    if [ "$i" -eq "$count" ] || { [ "${TOK_KIND[$i]}" = "o" ] && is_splitter "${TOK_TEXT[$i]}"; }; then
      check_segment "$seg_start" "$i"
      seg_start=$((i + 1))
    fi
    i=$((i + 1))
  done
  return 0
}

case "$tool_name" in
  Edit|Write|MultiEdit|NotebookEdit)
    if [ -z "$path_val" ]; then
      # Fail CLOSED: no path was extracted, but the payload names the file.
      is_md_target "$raw_norm" && deny_md
      is_self_target "$raw_norm" && deny_self
      exit 0
    fi
    file_tool_arm
    exit 0
    ;;
  Bash)
    bash_arm
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
