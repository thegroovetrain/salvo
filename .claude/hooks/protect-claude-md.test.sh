#!/usr/bin/env bash
# Tests for the CLAUDE.md moratorium hook.
#
# Every row of the spec's I/O & Edge-Case Matrix is asserted here, plus the
# read-only Bash commands that MUST keep working, the noise-suppression
# redirect (`2>/dev/null`) that must not read as a write, the false-deny rows
# that a target-scoped redirect/verb test has to let through (a commit message
# or PR body that merely NAMES CLAUDE.md), the obfuscated spellings that must
# not slip past, and the hook's own self-protection.
#
# The whole suite runs TWICE:
#   [py]   normal PATH, so the hook parses stdin with python3;
#   [nopy] PATH restricted to a temp bin dir holding only tr/grep/sed/head and
#          NO python3, so `command -v python3` genuinely fails and the raw-JSON
#          grep/sed fallback parser is what answers.
# The fallback is exercised by starving the environment, not by a test-only
# flag inside the hook: the hook has no test hooks of its own.
#
# CLAUDE_PROJECT_DIR is set EXPLICITLY on every case (to a fixture string that
# need not exist on disk), because the project-scope rule reads it; the "no
# project dir" row uses `env -u` via the NOPROJDIR marker.
#
# Fixtures are the real escaping a hook sees on stdin (JSON \n and \" inside
# command strings, etc.).

set -u

HERE=$(cd "$(dirname "$0")" && pwd)
HOOK="$HERE/protect-claude-md.sh"

if [ ! -x "$HOOK" ]; then
  printf 'FAIL: %s is missing or not executable\n' "$HOOK" >&2
  exit 1
fi

BASH_BIN=$(command -v bash)
ENV_BIN=/usr/bin/env

# The fixture project root. Nothing is created here; only string prefixes
# matter to the hook.
PROJ="/Users/e/Code/salvo"

# Temp bin dir with everything the hook needs EXCEPT python3. A failure here
# would silently turn the whole [nopy] suite into noise, so it is fatal.
FAKEBIN=$(mktemp -d "${TMPDIR:-/tmp}/hcnopy.XXXXXX") || {
  printf 'FAIL: could not create a temp bin dir for the no-python3 suite (mktemp -d failed). Is TMPDIR writable?\n' >&2
  exit 1
}
if [ ! -d "$FAKEBIN" ] || [ ! -w "$FAKEBIN" ]; then
  printf 'FAIL: temp bin dir %s is not a writable directory; the no-python3 suite cannot run.\n' "$FAKEBIN" >&2
  exit 1
fi
trap 'rm -rf "$FAKEBIN"' EXIT
for tool in tr grep sed head; do
  src=$(command -v "$tool") || {
    printf 'FAIL: %s not found on PATH; the hook needs it.\n' "$tool" >&2
    exit 1
  }
  ln -s "$src" "$FAKEBIN/$tool" || {
    printf 'FAIL: could not link %s into %s; the no-python3 suite cannot run.\n' "$tool" "$FAKEBIN" >&2
    exit 1
  }
  [ -e "$FAKEBIN/$tool" ] || {
    printf 'FAIL: %s/%s missing after link; the no-python3 suite cannot run.\n' "$FAKEBIN" "$tool" >&2
    exit 1
  }
done

PASSED=0
FAILED=0
MODE="py"
LAST_STDERR=""

build_env() { # $1 = extra env spec (space separated K=V, or NOPROJDIR)
  local extra="$1" tok
  ENVARGS=()
  case " $extra " in
    *" NOPROJDIR "*)
      ENVARGS[${#ENVARGS[@]}]="-u"
      ENVARGS[${#ENVARGS[@]}]="CLAUDE_PROJECT_DIR"
      extra=${extra//NOPROJDIR/}
      ;;
    *)
      ENVARGS[${#ENVARGS[@]}]="CLAUDE_PROJECT_DIR=$PROJ"
      ;;
  esac
  for tok in $extra; do
    ENVARGS[${#ENVARGS[@]}]="$tok"
  done
  if [ "$MODE" = "nopy" ]; then
    ENVARGS[${#ENVARGS[@]}]="PATH=$FAKEBIN"
  fi
}

invoke() { # $1 = json, $2 = extra env spec ("" for none); sets LAST_STDERR
  local json="$1" extra="$2" rc
  build_env "$extra"
  LAST_STDERR=$(printf '%s' "$json" | "$ENV_BIN" "${ENVARGS[@]}" "$BASH_BIN" "$HOOK" 2>&1 >/dev/null)
  rc=$?
  return $rc
}

check() { # $1 = description, $2 = expected exit code, $3 = json, [$4 = env]
  local desc="$1" expected="$2" json="$3" extra="${4:-}"
  local rc
  invoke "$json" "$extra"
  rc=$?
  if [ "$rc" -eq "$expected" ]; then
    PASSED=$((PASSED + 1))
    printf 'PASS [%s] %s (exit %s)\n' "$MODE" "$desc" "$rc"
  else
    FAILED=$((FAILED + 1))
    printf 'FAIL [%s] %s (expected exit %s, got %s)\n' "$MODE" "$desc" "$expected" "$rc"
  fi
}

check_msg() { # $1 = description, $2 = substring, $3 = json, [$4 = env]
  local desc="$1" needle="$2" json="$3" extra="${4:-}"
  local rc
  invoke "$json" "$extra"
  rc=$?
  case "$LAST_STDERR" in
    *"$needle"*)
      if [ "$rc" -eq 2 ]; then
        PASSED=$((PASSED + 1))
        printf 'PASS [%s] %s (stderr names "%s")\n' "$MODE" "$desc" "$needle"
        return 0
      fi
      ;;
  esac
  FAILED=$((FAILED + 1))
  printf 'FAIL [%s] %s (exit %s, stderr did not name "%s": %s)\n' \
    "$MODE" "$desc" "$rc" "$needle" "$LAST_STDERR"
}

file_json() { # $1 = tool_name, $2 = key, $3 = path
  printf '{"session_id":"t","hook_event_name":"PreToolUse","tool_name":"%s","tool_input":{"%s":"%s"}}' "$1" "$2" "$3"
}

write_json() { # $1 = path, $2 = content (already JSON-escaped)
  printf '{"session_id":"t","hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"%s","content":"%s"}}' "$1" "$2"
}

bash_json() { # $1 = command (already JSON-escaped)
  printf '{"session_id":"t","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"%s"}}' "$1"
}

deny_bash() { # $1 = description, $2 = escaped command
  check "$1" 2 "$(bash_json "$2")"
}

allow_bash() { # $1 = description, $2 = escaped command
  check "$1" 0 "$(bash_json "$2")"
}

run_suite() {
  # --- Matrix: file tools ---------------------------------------------------
  check "Edit tool on root CLAUDE.md" 2 \
    "$(file_json Edit file_path "$PROJ/CLAUDE.md")"
  check "Write tool on nested worktree CLAUDE.md" 2 \
    "$(file_json Write file_path "$PROJ/.claude/worktrees/x/CLAUDE.md")"
  check "Case variant claude.md" 2 \
    "$(file_json Edit file_path "$PROJ/claude.md")"
  check "Case variant Claude.MD" 2 \
    "$(file_json Write file_path "$PROJ/Claude.MD")"
  check "MultiEdit on CLAUDE.md" 2 \
    "$(file_json MultiEdit file_path "$PROJ/CLAUDE.md")"
  check "NotebookEdit notebook_path CLAUDE.md" 2 \
    "$(file_json NotebookEdit notebook_path "$PROJ/CLAUDE.md")"
  check "Bare relative CLAUDE.md path" 2 \
    "$(file_json Edit file_path CLAUDE.md)"
  check "Nested in-project client/CLAUDE.md" 2 \
    "$(file_json Edit file_path "$PROJ/client/CLAUDE.md")"

  check "Edit on README.md" 0 \
    "$(file_json Edit file_path "$PROJ/README.md")"
  check "Write on CLAUDE.local.md (personal escape hatch)" 0 \
    "$(file_json Write file_path "$PROJ/CLAUDE.local.md")"
  check "Write on a file merely ending in claude.md" 0 \
    "$(file_json Write file_path "$PROJ/notclaude.md")"
  check "Write on docs/key-decisions.md" 0 \
    "$(file_json Write file_path "$PROJ/docs/key-decisions.md")"
  check "Read tool is not matched at all" 0 \
    "$(file_json Read file_path "$PROJ/CLAUDE.md")"

  # --- Project scoping: another project's / the user's own CLAUDE.md --------
  check "User-level ~/.claude/CLAUDE.md is out of scope" 0 \
    "$(file_json Edit file_path "/Users/e/.claude/CLAUDE.md")"
  check "Unrelated repo CLAUDE.md is out of scope" 0 \
    "$(file_json Write file_path "/Users/e/Code/other/CLAUDE.md")"
  check "Out-of-project path denied when CLAUDE_PROJECT_DIR is unset" 2 \
    "$(file_json Edit file_path "/Users/e/.claude/CLAUDE.md")" "NOPROJDIR"

  # --- Self-protection: the hook and its settings --------------------------
  check "Edit on the hook script itself" 2 \
    "$(file_json Edit file_path ".claude/hooks/protect-claude-md.sh")"
  check "Edit on the hook test script" 2 \
    "$(file_json Edit file_path "$PROJ/.claude/hooks/protect-claude-md.test.sh")"
  check "Write on .claude/settings.json" 2 \
    "$(file_json Write file_path "$PROJ/.claude/settings.json")"
  check "Write on .claude/settings.local.json (permissions only)" 0 \
    "$(write_json "$PROJ/.claude/settings.local.json" '{\"permissions\":{}}')"
  check "Write arming the unlock via settings.local.json" 2 \
    "$(write_json "$PROJ/.claude/settings.local.json" '{\"env\":{\"HC_UNLOCK_CLAUDE_MD\":\"1\"}}')"
  check "Write naming the unlock in an unrelated file" 2 \
    "$(write_json "$PROJ/docs/notes.md" 'set HC_UNLOCK_CLAUDE_MD=1 to bypass')"

  # --- Matrix: Bash writes --------------------------------------------------
  deny_bash "Bash sed -i in place"            "sed -i '' 's/a/b/' CLAUDE.md"
  deny_bash "Bash sed --in-place"             "sed --in-place 's/a/b/' CLAUDE.md"
  deny_bash "Bash sed -E -i (flag not first)" "sed -E -i '' 's/a/b/' CLAUDE.md"
  deny_bash "Bash sed -i.bak"                 "sed -i.bak 's/a/b/' CLAUDE.md"
  deny_bash "Bash sed -i'' -e"                "sed -i'' -e 's/a/b/' CLAUDE.md"
  deny_bash "Bash sed -e ... -i last"         "sed -e 's/a/b/' -i '' CLAUDE.md"
  deny_bash "Bash sed --in-place=.bak"        "sed --in-place=.bak 's/a/b/' CLAUDE.md"
  deny_bash "Bash heredoc overwrite"          "cat > CLAUDE.md <<'EOF'\nx\nEOF"
  deny_bash "Bash append redirect"            "echo x >> CLAUDE.md"
  deny_bash "Bash clobber redirect"           "echo x >| CLAUDE.md"
  deny_bash "Bash tee"                        "echo x | tee CLAUDE.md"
  deny_bash "Bash mv"                         "mv /tmp/new.md CLAUDE.md"
  deny_bash "Bash cp"                         "cp /tmp/new.md CLAUDE.md"
  deny_bash "Bash rm"                         "rm CLAUDE.md"
  deny_bash "Bash truncate"                   "truncate -s 0 CLAUDE.md"
  deny_bash "Bash touch"                      "touch CLAUDE.md"
  deny_bash "Bash chmod"                      "chmod 644 CLAUDE.md"
  deny_bash "Bash ln"                         "ln -s /tmp/x CLAUDE.md"
  deny_bash "Bash patch"                      "patch CLAUDE.md < /tmp/p.diff"
  deny_bash "Bash dd of="                     "dd if=/tmp/x of=CLAUDE.md"
  deny_bash "Bash perl -pi"                   "perl -pi -e 's/a/b/' CLAUDE.md"
  deny_bash "Bash perl -p -i -e"              "perl -p -i -e 's/a/b/' CLAUDE.md"
  deny_bash "Bash python3 writer"             "python3 -c 'open(\\\"CLAUDE.md\\\",\\\"w\\\").write(1)'"
  deny_bash "Bash node writer"                "node -e 'require(1).writeFileSync(\\\"CLAUDE.md\\\")'"
  deny_bash "Bash awk reading the file"       "awk '{print}' CLAUDE.md"
  deny_bash "Bash awk with a pattern"         "awk '/^## /' CLAUDE.md"
  deny_bash "Bash git checkout"               "git checkout HEAD -- CLAUDE.md"
  deny_bash "Bash git restore"                "git restore CLAUDE.md"
  deny_bash "Bash git apply"                  "git apply /tmp/x.patch CLAUDE.md"
  deny_bash "Bash git rm"                     "git rm CLAUDE.md"
  deny_bash "Bash git -C before subcommand"   "git -C . checkout HEAD~3 -- CLAUDE.md"
  deny_bash "Bash git -c before subcommand"   "git -c core.pager=cat restore CLAUDE.md"
  deny_bash "Bash git stash naming the file"  "git stash push CLAUDE.md"
  deny_bash "Bash git reset naming the file"  "git reset --hard HEAD -- CLAUDE.md"
  deny_bash "Bash curl -o"                    "curl -sfL https://x/y -o CLAUDE.md"
  deny_bash "Bash wget -O"                    "wget -O CLAUDE.md https://x/y"
  deny_bash "Bash rsync"                      "rsync /tmp/x CLAUDE.md"
  deny_bash "Bash unlink"                     "unlink CLAUDE.md"
  deny_bash "Bash shred"                      "shred -u CLAUDE.md"
  deny_bash "Bash ed"                         "ed CLAUDE.md"
  deny_bash "Bash vim"                        "vim CLAUDE.md"
  deny_bash "Bash sponge"                     "cat /tmp/x | sponge CLAUDE.md"
  deny_bash "Bash find -delete"               "find . -name CLAUDE.md -delete"
  deny_bash "Bash find -exec rm"              "find . -name CLAUDE.md -exec rm {} ;"
  deny_bash "Bash tar extract over it"        "tar -xf /tmp/x.tar CLAUDE.md"
  deny_bash "Bash sudo wrapper"               "sudo rm CLAUDE.md"
  deny_bash "Bash xargs wrapper"              "ls | xargs rm CLAUDE.md"
  deny_bash "Bash leading assignment"         "FOO=1 cp x CLAUDE.md"
  deny_bash "Bash env wrapper"                "env python3 rewrite.py CLAUDE.md"
  deny_bash "Bash nohup wrapper"              "nohup truncate -s 0 CLAUDE.md"
  deny_bash "Bash lowercase path"             "echo hi > claude.md"
  deny_bash "Bash chained read-then-write"    "cat CLAUDE.md && echo x > CLAUDE.md"
  deny_bash "Bash fd-qualified redirect"      "echo x 1> CLAUDE.md"

  # --- Obfuscated spellings -------------------------------------------------
  deny_bash "Bash quote-split name"           "printf x > CLAUDE'.'md"
  deny_bash "Bash backslash-split name"       "printf x > C\\\\LAUDE.md"
  deny_bash "Bash fully quoted target"        "printf x > \\\"CLAUDE.md\\\""

  # --- Self-protection over Bash -------------------------------------------
  deny_bash "Bash chmod -x on the hook"       "chmod -x .claude/hooks/protect-claude-md.sh"
  deny_bash "Bash overwrite the hook"         "printf 'exit 0' > .claude/hooks/protect-claude-md.sh"
  deny_bash "Bash rm the hook dir"            "rm -rf .claude/hooks"
  deny_bash "Bash overwrite settings.json"    "echo '{}' > .claude/settings.json"
  deny_bash "Bash exporting the unlock"       "export HC_UNLOCK_CLAUDE_MD=1; echo x > CLAUDE.md"
  deny_bash "Bash exporting the unlock alone" "export HC_UNLOCK_CLAUDE_MD=1"
  allow_bash "Bash reading the hook"          "cat .claude/hooks/protect-claude-md.sh"
  allow_bash "Bash running the hook test"     "bash .claude/hooks/protect-claude-md.test.sh"

  # --- Matrix: Bash reads must pass ----------------------------------------
  allow_bash "Bash cat"                       "cat CLAUDE.md"
  allow_bash "Bash sed -n range"              "sed -n '1,40p' CLAUDE.md"
  allow_bash "Bash sed -n deploy section"     "sed -n '/## Deploy Configuration/,/^## /p' CLAUDE.md"
  allow_bash "Bash grep -n"                   "grep -n foo CLAUDE.md"
  allow_bash "Bash head"                      "head -20 CLAUDE.md"
  allow_bash "Bash wc -l"                     "wc -l CLAUDE.md"
  allow_bash "Bash git diff"                  "git diff CLAUDE.md"
  allow_bash "Bash git log"                   "git log -- CLAUDE.md"
  allow_bash "Bash git show"                  "git show HEAD:CLAUDE.md"
  allow_bash "Bash git reset without a path"  "git reset --hard"
  allow_bash "Bash grep -c with 2>/dev/null"  "grep -c x CLAUDE.md 2>/dev/null"
  allow_bash "Bash wc with 2>&1"              "wc -l CLAUDE.md 2>&1"
  allow_bash "Bash other-file redirect"       "echo x > notes.md"
  allow_bash "Bash CLAUDE.local.md write"     "echo x > CLAUDE.local.md"
  allow_bash "Bash sed -i on CLAUDE.local.md" "sed -i '' 's/a/b/' CLAUDE.local.md"
  allow_bash "Bash unrelated command"         "npm run check"

  # --- False denies that target-scoping must eliminate ----------------------
  allow_bash "Bash commit message naming it" \
    "git commit -m \\\"Rewrite CLAUDE.md to 74 lines\\\" -m \\\"Co-Authored-By: Claude <noreply@anthropic.com>\\\""
  allow_bash "Bash PR body with an arrow" \
    "gh pr create --body '302 -> 74 lines, CLAUDE.md'"
  allow_bash "Bash heredoc to another file naming it" \
    "cat > docs/notes.md <<'EOF'\nsee CLAUDE.md\nEOF"
  allow_bash "Bash git log piped to grep -i patch" \
    "git log --oneline -- CLAUDE.md | grep -i patch"
  allow_bash "Bash grep for a fat arrow" \
    "grep -n '=>' CLAUDE.md"
  allow_bash "Bash install verb in a different segment" \
    "npm install --include=dev && cat CLAUDE.md"
  allow_bash "Bash echo a sentence naming it" \
    "echo 'do not edit CLAUDE.md'"

  # A verb word sitting in an ARGUMENT list is not a write.
  allow_bash "Bash grep for the word install"  "grep -n install CLAUDE.md"
  allow_bash "Bash grep for the word touch"    "grep -n touch CLAUDE.md"
  allow_bash "Bash grep for the word python3"  "grep -n python3 CLAUDE.md"
  allow_bash "Bash grep for the word rm"       "grep -n rm CLAUDE.md"
  allow_bash "Bash grep for the word tee"      "grep -n tee CLAUDE.md"
  allow_bash "Bash echo naming a verb"         "echo rm CLAUDE.md"
  allow_bash "Bash git log --grep=touch"       "git log --grep=touch -- CLAUDE.md"
  allow_bash "Bash grep -c for the word cp"    "grep -c cp CLAUDE.md 2>/dev/null"

  # --- Deny messages --------------------------------------------------------
  check_msg "File deny names the unlock var" "HC_UNLOCK_CLAUDE_MD" \
    "$(file_json Edit file_path "$PROJ/CLAUDE.md")"
  check_msg "File deny names settings.json" ".claude/settings.json" \
    "$(file_json Edit file_path "$PROJ/CLAUDE.md")"
  check_msg "Bash deny names the unlock var" "HC_UNLOCK_CLAUDE_MD" \
    "$(bash_json "echo x > CLAUDE.md")"
  check_msg "Bash deny names settings.json" ".claude/settings.json" \
    "$(bash_json "echo x > CLAUDE.md")"
  check_msg "Self-protection deny says so" "protects itself" \
    "$(file_json Edit file_path "$PROJ/.claude/settings.json")"
  check_msg "Bash self-protection deny says so" "protects itself" \
    "$(bash_json "chmod -x .claude/hooks/protect-claude-md.sh")"

  # --- Matrix: unlock and fail-open ----------------------------------------
  check "Unlock env var allows Edit" 0 \
    "$(file_json Edit file_path "$PROJ/CLAUDE.md")" "HC_UNLOCK_CLAUDE_MD=1"
  check "Unlock env var allows Bash write" 0 \
    "$(bash_json "echo x > CLAUDE.md")" "HC_UNLOCK_CLAUDE_MD=1"
  check "Unlock set to 0 still blocks" 2 \
    "$(file_json Edit file_path "$PROJ/CLAUDE.md")" "HC_UNLOCK_CLAUDE_MD=0"
  check "Empty stdin fails open" 0 ""
  check "Non-JSON stdin fails open" 0 "not json at all"
  check "Truncated JSON fails open" 0 '{"tool_name":"Edit","tool_input":'
  check "JSON array fails open" 0 '["Edit","CLAUDE.md"]'
  check "Missing tool_input fails open" 0 '{"tool_name":"Edit"}'
  check "File tool with no path but naming it fails CLOSED" 2 \
    '{"tool_name":"Write","tool_input":{"contents":"# CLAUDE.md\nfrozen"}}'
  check "File tool with no path and no mention fails open" 0 \
    '{"tool_name":"Write","tool_input":{"contents":"# README\nhello"}}'
}

MODE="py"
printf '== suite: python3 parser ==\n'
run_suite

MODE="nopy"
printf '\n== suite: grep/sed fallback parser (python3 hidden) ==\n'
run_suite

printf '\n%s passed, %s failed\n' "$PASSED" "$FAILED"
[ "$FAILED" -eq 0 ] || exit 1
exit 0
