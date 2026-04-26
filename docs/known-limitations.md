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

### KL-007: Preprocessor conditional directives as transparent extras
- **Description**: `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`/`#endif` are handled
  as transparent extras tokens. They parse correctly when they wrap complete
  statements or appear at definition level, but produce ERROR nodes when
  they split mid-expression, appear inside collection literals, or straddle
  construct boundaries (e.g., between `if` body and `else` keyword).
- **Root cause**: Tree-sitter's extras mechanism makes tokens transparent —
  they can appear anywhere and are consumed without affecting the parse tree.
  This works for the ~98% of Pike files where preprocessor conditionals wrap
  complete constructs. For the remaining ~2%, the `#if`/`#endif` split a single
  syntactic construct across preprocessor branches.

  An attempt was made in Round 14 to implement structured `preproc_if` rules
  (following tree-sitter-c's approach) by removing conditional directives from
  extras and adding explicit grammar rules at every position. This regressed
  from 98.2% to 94.3% (1063→1021 clean files) because:
  1. `#if` can appear inside expressions, mapping literals, array literals,
     argument lists, switch cases, enum bodies, and dozens of other positions.
     Adding `preproc_if` as an alternative in each position creates cascading
     GLR conflicts with existing expression ambiguities.
  2. The tree-sitter-c approach works because C has a simpler position set
     (block items, struct fields, enum enumerators). Pike is more permissive.
  3. The `preproc_if_in_mapping` variant (for `#if` inside mapping literals)
     created infinite conflict cascades because `mapping_pair` contains `_expr`,
     which has many ambiguous alternatives.

  The commit `pre-preproc-redesign` (tagged at `6180b02`) marks the rollback
  point for this attempt.
- **Impact**: 19 distribution files have errors related to preprocessor splits:
  - 8 files: `#if` splits an expression (e.g., `x = #ifdef FOO a #else b #endif;`)
  - 6 files: Macro argument shape issues with `#if` inside macro calls
  - 5 files: Other edge cases (mapping macros, bare identifier macros, etc.)
- **Architectural decision**: Keep extras-based handling. The 98.2% baseline is
  the ceiling for the current architecture. Going higher requires either:
  (a) A permissive "skip everything between #if and #endif" rule in specific
      positions (loses tree fidelity inside skipped regions), or
  (b) An external scanner that tracks `#if`/`#endif` nesting and handles
      the split cases at the lexer level.
- **Last validated**: Round 14
- **Rounds active**: 2
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
