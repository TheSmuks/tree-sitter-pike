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
- **Impact**: See KL-007c for detailed per-file macro-argument analysis.
- **Last validated**: Round 15
- **Rounds active**: 4+ (sub-categorized in Round 15)
### KL-007: Preprocessor conditional directives as transparent extras

See sub-entries KL-007a through KL-007e for per-category analysis.

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

- **Last validated**: Round 15
- **Rounds active**: 3

#### KL-007a: Preprocessor splitting expressions (5 files)

The `#if`/`#ifdef`/`#endif` block splits a sub-expression so that neither
branch is a complete expression. Tree-sitter sees a dangling operator with
no right operand (or a value with no operator).

| File | Location | What is split | Token sequence at failure |
|------|----------|---------------|---------------------------|
| `lib/modules/Audio.pmod/Codec.pmod` | line 69 | `&&` right operand in `if` condition | `&&\n#if constant(...)\n  expr\n#else\n  expr\n#endif\n)` |
| `lib/modules/Concurrent.pmod` | line 1239 | Variable initializer | `=\n#ifdef CONCURRENT_DEBUG\n  expr\n#else\n  ""\n#endif\n  ;` |
| `lib/modules/Parser.pmod/LR.pmod/GrammarParser.pmod` | line 327 | Function call argument | `ErrorHandler(\n#ifdef LR_DEBUG 1 #else 0 #endif)` |
| `lib/modules/Protocols.pmod/LysKOM.pmod/Raw.pike` | line 336 | `||` right operand inside `H()` call | `whoami||\n#if constant(...)\n  expr\n#else\n  "*unknown*"\n#endif` |
| `src/modules/_Stdio/socktest.pike` | line 397 | `>` right operand in `if` condition | `oob_sent >\n#ifdef OOB_DEBUG\n  5\n#else\n  511\n#endif\n)` |

**External scanner path**: An external scanner that tracks `#if`/`#endif` nesting
and emits structured tokens could resolve these. The scanner would need to
consume the entire `#if`...`#endif` block as a single token, which the grammar
then unpacks. This works for expression-interior `#if` because the grammar
doesn't need to see the preprocessor tokens individually.

**Grammar-only path**: Adding `preproc_if` to `primary_expr` (as `preproc_if_expr`)
works for simple cases (verified in Round 14) but fails when the `#if`/`#endif`
block is nested inside a larger expression context like `&&` or `||`.

#### KL-007b: Preprocessor splitting control flow (5 files)

The `#if`/`#endif` block splits a control-flow construct: wrapping the
then-clause of an if-else (making `else` appear detached), emitting a modifier
block opening brace, or appearing between `}` and the next statement.

| File | Location | What is split | Token sequence at failure |
|------|----------|---------------|---------------------------|
| `src/post_modules/GTK1/make_example_image.pike` | line 65 | `#if` wraps if-then, `else` after `#endif` | `if (cond)\n#if constant(...)\n  then_stmt;\n#else\n  return 1;\n#endif\nelse\n  alt_stmt;` |
| `src/post_modules/GTK2/make_example_image.pike` | line 75 | Same pattern | Same pattern as GTK1 |
| `lib/modules/Sql.pmod/tds.pike` | line 187 | `#if` emits `protected {` creating modifier block | `#if ...\nprotected {\n#endif ... declarations ... #if ...\n}\n#endif` |
| `lib/7.8/modules/SSL.pmod/sslfile.pike` | line 612 | `FIX_ERRNOS({...}, 0)` + PP-SPLIT compound | Multiple FIX_ERRNOS and ENTER/RETURN macro patterns |
| `lib/modules/Protocols.pmod/LDAP.pmod/client.pike` | line 116 | `DO_IF_DEBUG` in parameter position | `get_attr_decoder(string attr, DO_IF_DEBUG(void|int nowarn))` |

**External scanner path**: The if-then/else case (GTK1/GTK2) could be addressed
by a scanner that recognizes the `if ... #endif else` pattern and emits a
combined token. The modifier block case (tds.pike) requires the scanner to
understand Pike declaration syntax, which is beyond a simple nesting tracker.
The `DO_IF_DEBUG` case is actually a macro-argument issue (see KL-007c).

**Grammar-only path**: Adding `preproc_if` as consequence/alternative in
`if_statement` was tried in Round 14. It works when `#if` wraps the ENTIRE
else body but not when it splits mid-body.

#### KL-007c: Macro invocations with non-standard argument shapes (7 files)

Macro calls where the arguments have shapes that `macro_argument_list`
doesn't accept: blocks, backtick operators, keywords as identifiers, or
argument counts/positions that differ from standard function calls.

| File | Location | Macro pattern | What macro_argument_list rejects |
|------|----------|---------------|----------------------------------|
| `lib/7.8/modules/SSL.pmod/sslfile.pike` | line 612 | `FIX_ERRNOS({block}, 0)` | Block `{...}` as first arg, followed by `, 0)` |
| `lib/modules/Parser.pmod/LR.pmod/module.pmod` | line 1306 | `LR_GAUGE("LR0", {block})` | Block `{...}` as second arg after string |
| `lib/modules/Protocols.pmod/TELNET.pmod` | line 805 | `HANDLE(remote,WILL,WONT,DO,DONT)` | 5 bare identifier args (no blocks) — `macro_statement` pattern mismatch |
| `lib/modules/Protocols.pmod/LDAP.pmod/client.pike` | line 116 | `DO_IF_DEBUG(void|int nowarn)` | `void|int` type syntax as macro argument |
| `lib/modules/Standards.pmod/URI.pike` | line 649 | `P(X)` → `#X:X` mapping pair | `P(scheme)` in mapping literal — grammar sees call, not pair |
| `lib/modules/Debug.pmod/Subject.pike` | line 46 | `void PROXY(destroy, 0);` | Type + macro call as declaration; `PROXY(\`->, 0)` has backtick op |
| `src/post_modules/GSSAPI/test.pike` | line 28 | `TEST_CODE({block})` | Block `{...}` as sole variadic arg |

**External scanner path**: Not applicable. These are not preprocessor-split
issues — they're about the grammar's macro invocation rules not covering
all argument shapes found in real Pike code.

**Grammar-only path**: Several of these are fixable:
- `FIX_ERRNOS({...}, 0)` and `LR_GAUGE("...", {...})` and `TEST_CODE({...})`: `macro_argument_list` needs to accept blocks at more positions.
- `HANDLE(remote,WILL,WONT,DO,DONT)`: Bare identifier args should already work; investigate why `macro_statement` pattern fails.
- `DO_IF_DEBUG(void|int nowarn)`: `void|int` type in arg position — `macro_argument_list` doesn't accept type syntax.
- `P(X)` mapping pair: Fundamentally unfixable — the grammar can't know that `P(scheme)` expands to `"scheme":scheme`.
- `PROXY(\`->, 0)`: Backtick operator as macro argument — the grammar's `macro_argument_list` doesn't accept backtick identifiers.

#### KL-007d: Adjacent macro invocations producing implicit concatenation (2 files)

Two or more macro invocations appear adjacent without an operator between them.
After expansion, they produce a valid expression (typically string concatenation).
Without expansion, tree-sitter sees `IDENTIFIER IDENTIFIER(args)` — two
expressions with no operator, which is a parse error.

| File | Location | Pattern | Token sequence |
|------|----------|---------|----------------|
| `lib/7.8/modules/Standards.pmod/ASN1.pmod/Types.pmod` | line 1080 | `DEC_COMB_MARK GR("")` in array literal | `IDENTIFIER IDENTIFIER("")` — expands to string concatenation |
| `bin/install.pike` | line 1533 | `RELAY(X)` chain with trailing `+` | `RELAY(TMP_LIBDIR)\n  RELAY(LIBDIR_SRC)` — expands to `
TMP_LIBDIR
=
+TRVAR(TMP_LIBDIR)+  ,
LIBDIR_SRC
=
+TRVAR(LIBDIR_SRC)+` |

**External scanner path**: Not applicable. These require macro expansion awareness.

**Grammar-only path**: Could add a grammar rule for `IDENTIFIER IDENTIFIER(args)`
as implicit string concatenation, but this would conflict with labeled statements
(`label: statement`) and function-call-as-expression-statement patterns.
Fundamentally unfixable without macro expansion.

#### KL-007e: Lexer/scanner limitations (1 file)

| File | Location | Issue | Token sequence |
|------|----------|-------|----------------|
| `lib/modules/Tools.pmod/Standalone.pmod/precompile.pike` | line 2148 | `#"\\n` breaks hash-string token | `#"` followed by backslash-newline; the `\\.` regex escape consumes the newline, but the token fails to match correctly when the content includes preprocessor-like lines |

**External scanner path**: An external scanner for hash-strings that tracks
the opening `#"` and scans for the closing `"` without regex would fix this.

**Grammar-only path**: The regex `seq('#"', repeat(choice(/[^"\\\\]/, /\\\\./)), '"')`
works for most hash-strings but fails when the content starts with backslash-newline.
This may be a tree-sitter regex engine limitation with line-spanning tokens.

#### KL-007f: Bare macro identifiers expanding to nothing (1 file)

| File | Location | Issue |
|------|----------|-------|
| `lib/modules/Stdio.pmod/Terminfo.pmod` | line 15 | `MUTEX` expands to empty or to a full declaration; tree-sitter sees a bare identifier as a top-level statement |

**External scanner path**: Not applicable.

**Grammar-only path**: The grammar already accepts `IDENTIFIER;` as an
expression statement (via `macro_statement`). The issue is `MUTEX` has no
semicolon. Could extend `declaration` to accept a bare identifier without `;`
at the top level, but this would create conflicts with every other use of
identifiers (type names, variable names, etc.). Marginal fixability.
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
