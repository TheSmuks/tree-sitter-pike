# Known Limitations

Each item has a "Last validated" field indicating the most recent round where
the limitation was confirmed to still hold. Items that have been on the list
for 2+ rounds without progress must include a written reason or be escalated.

## Active Limitations

### KL-004: Top-level break/continue without enclosing loop
- **Description**: `break` and `continue` parse at the top level of a block
  without checking for an enclosing loop/switch. Pike would reject these.
- **Root cause**: Tree-sitter grammars cannot enforce context-sensitive
  constraints like "must be inside a loop." This is a semantic check, not
  a syntactic one.
- **Impact**: Accepts invalid Pike code. Low severity since static analysis
  tools catch this.
- **Last validated**: Round 12
- **Rounds active**: 3+

### KL-006: Complex macro invocations not fully covered
- **Description**: Macro invocations with non-trivial bodies (e.g.,
  `OVERLOAD_TIMEOFDAY;`, `FIX_ERRNOS({...})`, `TEST_CODE({...})`,
  `INHERIT_MUTEX;`) produce ERROR nodes. The grammar handles the common
  patterns (`IDENTIFIER(args);`, `IDENTIFIER(args) block IDENTIFIER;`) but
  not all variants found in the Pike distribution.
- **Root cause**: Without actual macro expansion, tree-sitter cannot know
  what `OVERLOAD_TIMEOFDAY` expands to. The grammar's macro rules handle
  patterns that look like balanced constructs (open/close pairs), but
  bare macro names that expand to statements or expressions are
  indistinguishable from undefined identifiers.
- **Impact**: 8 distribution files affected.
- **Last validated**: Round 12
- **Rounds active**: 1

### KL-007: Remaining distribution errors (~65 files)
- **Description**: 65 of 1082 Pike distribution files still have parse errors.
  The largest categories are fixed (shebang: 20 files, double-backtick: 6,
  preprocessor with spaces: 8, etc.). Remaining errors fall into smaller
  categories: adjacent string concatenation with identifiers, module-scope
  declarations, sscanf complex formats, and various single-file issues.
- **Impact**: 6.0% error rate (down from 10.6% at start of Round 12).
- **Last validated**: Round 12
- **Rounds active**: 1

### KL-008: Invisible modifier nodes in declarations
- **Description**: Declaration modifiers (`protected`, `private`, `public`,
  etc.) are consumed by the hidden `_modifier` rule and produce no named
  child nodes. Downstream consumers (highlighters, refactoring tools) cannot
  see which modifiers were applied.
- **Root cause**: The `_modifier` rule is intentionally hidden (underscore
  prefix) to avoid polluting the parse tree with modifier nodes at every
  declaration position. The tradeoff is correct but suboptimal for consumers.
- **Impact**: Structural limitation, not a correctness issue. Affects all
  declarations with modifiers.
- **Last validated**: Round 12
- **Rounds active**: 1

## Resolved Limitations

### KL-001: function(:void) zero-arg type — RESOLVED in Round 10
- **Original claim**: `function(:void)` produces zero-width missing identifier.
- **Resolution**: The `_function_type` rule with `optional(trailingCommaSep1($.type))`
  correctly handles the zero-argument case. GLR handles this without error recovery.
- **Removed**: Round 10

### KL-002: `foo=` backtick setter form — RESOLVED in Round 10
- **Original claim**: `` `foo= `` setter form requires external scanner.
- **Resolution**: Added `=?` to the backtick identifier regex.
- **Removed**: Round 10

### KL-003: version_prefix (7.8::foo) — RESOLVED in Round 12
- **Original claim**: `7.8::foo` requires external scanner because `7.8` is
  lexed as float, not version prefix.
- **Resolution**: The fix absorbs `::` into the `version_prefix` token itself:
  `token(seq(/[0-9]+/, '.', /[0-9]+/, '::'))`. The scanner now sees `7.8::`
  as a distinct (longer) token from `7.8`, which matches `float_literal`.
  This mirrors Pike's lexer behavior where `TOK_VERSION` is produced by
  lookahead for `::`. Space before `::` correctly breaks the token (float
  then error), matching Pike's behavior.
- **Removed**: Round 12

### KL-005: class { }() as expression — REMOVED in Round 10
- **Original claim**: Anonymous class instantiation fails.
- **Resolution**: False positive. `anon_class` is in `primary_expr` and works.
- **Removed**: Round 10
