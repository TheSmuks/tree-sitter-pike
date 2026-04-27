#!/usr/bin/env bash
# ast-grep integration test suite for tree-sitter-pike
# Run from project root: bash test/ast-grep/run.sh
# Exit code 0 = all tests pass, 1 = any test fails.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG="$PROJECT_DIR/sgconfig.yml"
EXAMPLES="$PROJECT_DIR/examples"
PASS=0
FAIL=0

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
green(){ printf '\033[32m%s\033[0m\n' "$1"; }

assert_matches() {
  local description="$1"
  local pattern="$2"
  local min_count="${3:-1}"
  local path="${4:-$EXAMPLES}"

  local count
  count=$(cd "$PROJECT_DIR" && bunx ast-grep run -c "$CONFIG" -l pike -p "$pattern" "$path" 2>&1 | grep -c "^[^ ]" || true)

  if [ "$count" -ge "$min_count" ]; then
    green "  PASS: $description ($count matches)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $description (expected >= $min_count, got $count)"
    FAIL=$((FAIL + 1))
  fi
}

assert_scan_matches() {
  local description="$1"
  local rule_file="$2"
  local min_count="${3:-1}"
  local path="${4:-$EXAMPLES}"

  # Write a temporary config pointing to the rule file
  local tmp_config
  tmp_config=$(mktemp)
  local rule_dir
  rule_dir=$(dirname "$rule_file")
  cat > "$tmp_config" << EOF
ruleDirs: ["$rule_dir"]
customLanguages:
  pike:
    libraryPath: $PROJECT_DIR/pike.so
    extensions: [pike, pmod]
    expandoChar: _
EOF

  local count
  count=$(cd "$PROJECT_DIR" && bunx ast-grep scan -c "$tmp_config" "$path" 2>&1 | grep -c "^[a-z]" || true)
  rm -f "$tmp_config"

  if [ "$count" -ge "$min_count" ]; then
    green "  PASS: $description ($count matches)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $description (expected >= $min_count, got $count)"
    FAIL=$((FAIL + 1))
  fi
}

assert_rewrite_preview() {
  local description="$1"
  local pattern="$2"
  local rewrite="$3"
  local path="$4"

  local output
  output=$(cd "$PROJECT_DIR" && bunx ast-grep run -c "$CONFIG" -l pike -p "$pattern" --rewrite "$rewrite" "$path" 2>&1 || true)

  if echo "$output" | grep -q "^@@"; then
    green "  PASS: $description (rewrite produces diff)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $description (rewrite produced no diff)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== ast-grep integration tests ==="
echo ""

# --- Pattern search tests ---
echo "Pattern search (-p):"

assert_matches "Function declarations" \
  'void $FN($$$ARGS) { $$$BODY }' 5

assert_matches "Protected function declarations" \
  'protected void $FN($$$ARGS) { $$$BODY }' 5

assert_matches "Class declarations" \
  'class $NAME { $$$BODY }' 3

assert_matches "Inherit statements" \
  'inherit $X;' 5

assert_matches "If statements" \
  'if ($COND) { $$$BODY }' 5

assert_matches "Foreach statements" \
  'foreach($ITER; $LVAL) { $$$BODY }' 1

assert_matches "While statements" \
  'while ($COND) { $$$BODY }' 1

assert_matches "Return statements" \
  'return $VAL;' 10

assert_matches "Modifier visibility (protected)" \
  'protected void $FN($$$ARGS) { $$$BODY }' 3

echo ""

# --- Rule-based scan tests ---
echo "Rule-based scan (YAML rules):"

assert_scan_matches "if_statement by kind" \
  "$SCRIPT_DIR/kind-if-statement.yml" 5

assert_scan_matches "protected modifier by kind" \
  "$SCRIPT_DIR/kind-modifier.yml" 3

echo ""

# --- Rewrite tests ---
echo "Rewrite preview:"

assert_rewrite_preview "Inherit rewrite" \
  'inherit $X;' \
  'inherit $X;  // kept' \
  "$EXAMPLES/adt_struct.pike"

echo ""

# --- Summary ---
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
