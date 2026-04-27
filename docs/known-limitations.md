# Known Limitations

Each item has a "Last validated" field indicating the most recent round where
the limitation was confirmed to still hold. Items that have been on the list
for 2+ rounds without progress must include a written reason or be escalated.

## Permissive Parsing

The grammar may accept syntactically-shaped constructs that Pike's compiler
rejects, when doing so produces structurally-correct parse trees for
downstream tooling (ast-grep, language servers, code formatters). This is a
deliberate design choice: tree-sitter is a parser, not a validator. Strict
syntactic validation is the consumer's responsibility.

Known instances:

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

### KL-009: Top-level statement keywords accepted (ast-grep tradeoff)
- **Description**: Statement keywords (`if`, `while`, `for`, `foreach`, `switch`,
  `return`, `break`, `continue`, `do`) parse at file scope. Pike rejects these
  with "unexpected TOK_<keyword>". The grammar accepts them to prevent
  `macro_invocation` from matching keyword tokens, which broke ast-grep
  pattern matching for statements.
- **Root cause**: In tree-sitter's GLR parser, when no keyword rule matches at
  top level (because `_definition` didn't include statements), keyword tokens
  fell through to `identifier` matching via the `word` property. The fix was
  to add statement rules to `_definition`. This accepts structurally correct
  but semantically invalid Pike code.
- **Impact**: Top-level `if (x) { y; }` parses as `if_statement` instead of
  `macro_invocation`. Both are wrong (Pike rejects both), but `if_statement`
  is the correct structural representation. Static analysis tools should flag
  top-level statements as errors. No distribution regressions.
- **Last validated**: Round 21 (post v1.0.0)
- **Rounds active**: 1

## Active Limitations

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

Pike uses `#if`/`#ifdef`/`#ifndef`/`#else`/`#elif`/`#endif` for conditional
compilation. In the current grammar, these are transparent extras: they appear
between any two tokens and the parser ignores them. This works for the
majority of cases (the directives appear at statement/definition boundaries)
but fails when they split a syntactic structure mid-expression or mid-statement.

Additionally, several macro invocation patterns found in real Pike code have
argument shapes that the grammar cannot parse without macro expansion.

The current extras-based approach reaches 98.7% (1067/1082 distribution files
clean, 208/208 corpus tests passing). The remaining 15 error files fall into
5 sub-entries (KL-007a through KL-007e) plus one edge case (KL-007f).

An attempt was made in Round 14 to implement structured `preproc_if` grammar
rules (following tree-sitter-c's approach) by removing conditional directives
from extras and adding explicit grammar rules at every position. This regressed
from 98.2% to 94.3% (1063→1021 clean files) because `#if` can appear inside
any syntactic construct in Pike, and adding `preproc_if` as an alternative in
each position creates cascading GLR conflicts. The tree-sitter-c approach works
because C has a smaller position set. The commit `pre-preproc-redesign` (tagged
at `6180b02`) marks the rollback point.

Round 16 attempted to implement PREPROC_BLOCK (opaque #if...#endif blocks)
via external scanner. This was found to be incompatible with the transparent
extras approach: 224 files contain conditional directives, and making them
opaque would regress tree fidelity for all of them. See docs/scanner-design.md
§10 for the analysis. The scanner was reduced to hash-string-only (HASH_STRING).

- **Last validated**: Round 20 (ceiling)
- **Rounds active**: 9
- **Status**: ARCHITECTURAL CEILING — all approaches exhausted
- **Impact**: 11 distribution files have errors:
  - KL-007a: 7 files (PP splitting) — **scanner cannot determine if PP block contains standalone expression (Round 20)**
  - KL-007b: 0 files — **RESOLVED in Round 18** (bare identifier with optional `;`)
  - KL-007c: 0 files — **RESOLVED in Round 18** (typed macro invocation in declaration)
  - KL-007d: 0 files — **RESOLVED in Round 17** (mapping_literal accepts postfix_expr)
  - KL-007e: 0 files — **RESOLVED in Round 18** (string_concat accepts macro_invocation)
  - KL-007f: 1 file (tds.pike: modifier on local_function_decl) — **GLR state machine structural change; all 4 rule variants regress sslfile.pike (Round 20)**
  - KL-007g: 1 file (install.pike: RELAY juxtaposition in + chain) — **string_concat ambiguity at statement boundaries (Round 19)**
  - KL-007h: 2 files (sslfile.pike, client.pike: if-statement as macro arg) — **macro_invocation_stmt in _stmt causes 13 test regressions (Round 20)**
  - Some files appear in multiple sub-entries (total unique: 11)
#### KL-007a: PP splitting expressions (7 files) — scanner cannot determine PP block completeness

The `#if`/`#ifdef`/`#endif` block splits a sub-expression. Tree-sitter sees a
dangling operator with no right operand, or a value with no operator.

**Round 20**: Implemented PREPROC_BLOCK scanner token with STMT_BOUNDARY_MARKER
sentinel mechanism. The sentinel is an external token added to `_definition`,
`_stmt`, and `class_body` that's never emitted — its presence in `valid_symbols`
tells the scanner it's at a statement boundary. The scanner emits PREPROC_BLOCK
only when STMT_BOUNDARY_MARKER is NOT valid (i.e., at expression-interior positions).

Results:
- 4 files fixed: Codec.pmod, Concurrent.pmod, GrammarParser.pmod, socktest.pike
- 15 regressions: files where PP blocks contain non-expression content
- Net: 1059/1082 (12 regressions), REVERTED

The regressions confirm the limitation is not just position discrimination but
also content discrimination. The scanner correctly identifies expression-interior
positions via STMT_BOUNDARY_MARKER, but it cannot determine whether a PP block
contains a standalone expression or a partial expression (commas, continuation
fragments, semicolons inside the block). This requires parsing, which the scanner
cannot do.

Specific regression patterns:
- `foreach(PP_BLOCK, string index)`: PP block contains iterator WITH trailing comma
- `func(PP_BLOCK, more_args)`: PP block contains partial arguments
- Any PP block where `#if`/`#else` branches contain incomplete expressions

The STMT_BOUNDARY_MARKER mechanism is correct and available for future use if
a content-completeness heuristic is ever developed.

| # | File | Location | What is split | Token sequence at failure |
|---|------|----------|---------------|---------------------------|
| 1 | `Concurrent.pmod` | line 1239 | Variable initializer | `private string orig_backtrace =\n#ifdef CONCURRENT_DEBUG\n  sprintf(...)\n#else\n  \"\"\n#endif\n;` |
| 2 | `Parser/LR/GrammarParser.pmod` | line 327 | Function call argument | `ErrorHandler(\n#ifdef LR_DEBUG\n  1\n#else\n  0\n#endif\n)` |
| 3 | `Protocols/LysKOM/Raw.pike` | line 336 | `||` right operand in string concat | `whoami||\n#if constant(...)\n  expr\n#else\n  \"*unknown*\"\n#endif` |
| 4 | `src/_Stdio/socktest.pike` | line 397 | `>` right operand in `if` condition | `oob_sent >\n#ifdef OOB_DEBUG\n  5\n#else\n  511\n#endif\n)` |
| 5 | `Audio/Codec.pmod` | line 69 | `==` right operand in `&&` condition | `fc->type ==\n#if constant(...)\n  _Ffmpeg.AVMEDIA_TYPE_AUDIO\n#else\n  _Ffmpeg.CODEC_TYPE_AUDIO\n#endif\n)` |
| 6 | `GTK1/make_example_image.pike` | line 65 | `#if` wraps if-then, `else` after `#endif` | `if (cond)\n#if constant(Gnome.init)\n  Gnome.init(...);\n#else\n  return 1;\n#endif\nelse\n  GTK1.setup_gtk(...);` |
| 7 | `GTK2/make_example_image.pike` | line 75 | Same pattern as GTK1 | Same as #6 with GTK2 |

#### KL-007b: PP splitting control flow (5 files) — Not scanner-addressable

The `#if`/`#endif` block splits a control-flow construct: wrapping the
then-clause of an if-else (making `else` appear detached), emitting a
modifier block opening brace, or splitting function signatures.

| # | File | Location | What is split | Token sequence at failure |
|---|------|----------|---------------|---------------------------|
| 1 | `GTK1/make_example_image.pike` | line 65 | `#if` wraps if-then, `else` after `#endif` | `if (cond)\n#if constant(Gnome.init)\n  Gnome.init(...);\n#else\n  return 1;\n#endif\nelse\n  GTK1.setup_gtk(...);` |
| 2 | `GTK2/make_example_image.pike` | line 75 | Same pattern as GTK1 | `if (cond)\n#if constant(GTK2.gnome_init)\n  GTK2.gnome_init(...);\n#else\n  return 1;\n#endif\nelse\n  GTK2.setup_gtk(...);` |
| 3 | `Sql/tds.pike` | lines 53-57 | `#if` emits `protected {` creating modifier block | `#if (Pike >= 7.6)\nprotected {\n#endif\n  ... declarations ...\n#if (Pike >= 7.6)\n};\n#endif` |
| 4 | `SSL/sslfile.pike` | line 848 | ENTER/RETURN/LEAVE macros + RUN_MAYBE_BLOCKING | Complex compound of macro args + control flow splitting |
| 5 | `Protocols/LDAP/client.pike` | line 1461 | IF_ELSE_PAGED_SEARCH macro containing if-block | `IF_ELSE_PAGED_SEARCH(\n  if (supported_controls[...]) {\n    ...\n  },);` |

**Scanner resolution**: The if-then/else cases (#1, #2) require the scanner
to recognize that `#endif` followed by `else` means the else belongs to the
outer if. The scanner would emit a combined token that the grammar consumes
as part of `if_statement`. The modifier block case (#3) is harder — the
scanner needs to emit the `protected {` as part of the block content, not as
a separate statement. The compound cases (#4, #5) involve macro argument
shapes that the scanner alone cannot fix.

**Grammar-only path**: Adding `preproc_if` as consequence/alternative in
`if_statement` was tried in Round 14. It works when `#if` wraps the ENTIRE
else body but not when it splits mid-body.

#### KL-007c: Macro invocations with non-standard argument shapes (4 files)

Macro calls where the arguments have shapes that `argument_list` doesn't
accept: blocks, backtick operators, keywords as identifiers, or argument
counts/positions that differ from standard function calls. These are NOT
preprocessor-split issues — they are grammar rule limitations.

**The 5 patterns specified for diagnosis:**

1. **FIX_ERRNOS({...}, 0)** — Block followed by additional args.
   - `SSL/sslfile.pike` line 612: `FIX_ERRNOS({local_errno = cb_errno; cb_errno = 0;}, 0)`
   - **Fixed in Round 15** by adding `$.block` to `argument_list`. The block
     `{...}` is now accepted as a function/macro argument.

2. **TEST_CODE({block})** — Block as sole variadic arg.
   - `src/post_modules/GSSAPI/test.pike` line 28: `TEST_CODE({ test code here })`
   - **Fixed in Round 15** by adding `$.block` to `argument_list`.

3. **PROXY(`->, 0)** — Backtick operator as arg.
   - `Debug/Subject.pike` line 46: `mixed PROXY(\`->, 0);` (and 45 more lines)
   - **Not fixed.** The backtick operator `\`->` is a valid Pike operator name
     but the grammar's `argument_list` does not accept backtick identifiers.
     Adding them would require extending `argument_list` to accept
     `backtick_identifier` without creating conflicts with expression parsing.
     Additionally, the pattern `mixed PROXY(...)` where `PROXY` is a macro
     expanding to a function definition means `void PROXY(\`->, 0);` expands
     to `mixed \`-> (mixed ... args) { ENTER(\`->); return 0; }` — the
     grammar cannot know this.

4. **HANDLE(local, WILL, WONT, DO, DONT)** — Keyword identifiers as args.
   - `Protocols/TELNET.pmod` line 805: `HANDLE(remote,WILL,WONT,DO,DONT)`
   - **Fixed in Round 15** by adding `$.magic_identifier` to `argument_list`.
     Keywords like `local`, `DO`, `WONT` are accepted via `magic_identifier`.

5. **DECODE_ENTRIES(x, {...})** — Value followed by block.
   - No standalone file for this pattern in the current error set.
   - Subsumed by the `$.block` in `argument_list` fix — same mechanism.

**Additional macro-argument patterns found in the error set:**

| File | Location | Macro pattern | Status |
|------|----------|---------------|--------|
| `Audio/Codec.pmod` | line 69 | PP-split inside `&&` condition (KL-007a) | Scanner issue |
| `Sql/tds.pike` | line 187 | `protected {` emitted by `#if` (KL-007b) | Scanner issue |
| `Protocols/LDAP/client.pike` | line 116 | `DO_IF_DEBUG(void|int nowarn)` | **Not fixed.** Type syntax `void|int` as macro arg requires `argument_list` to accept full type expressions, creating massive conflicts. |
| `SSL/sslfile.pike` | line 848 | `RUN_MAYBE_BLOCKING(...)` with code blocks | Partially fixed — `$.block` in `argument_list` helps but the 4th arg contains complex control flow that the grammar cannot parse structurally. |
| `SSL/sslfile.pike` | line 1568 | `ENTER`/`RETURN`/`LEAVE` macro chains | Not a macro-arg issue — these expand to `do { ... } while(0)` and parse correctly in non-debug mode. Debug mode has different expansions. |
| `ASN1/Types.pmod` | line 1080 | `DEC_COMB_MARK GR("")` adjacent macros | KL-007d-style adjacent macro concatenation |
| `bin/install.pike` | line 1533 | `RELAY(X)` chain with implicit concat | KL-007d-style adjacent macro concatenation |

**Also fixed in Round 15:** Removed `'bits'` from `magic_identifier`.
`bits` is not a Pike keyword — it appears only inside `int(bits 8)` type
syntax as a contextual keyword in `_int_range`. Having it in
`magic_identifier` caused `nist_primes(bits / 64 - 8)` to misparse because
`bits` was matched as a magic identifier instead of a regular identifier
expression.

#### KL-007d: Macro invocation in mapping element position — RESOLVED in Round 17

A macro invocation `P(X)` expands to `"X":X` — a mapping pair. Without
macro expansion, tree-sitter sees `P(scheme)` as a function call, not a
mapping pair.

**Round 17 fix**: Extended `mapping_literal` to accept `postfix_expr` (function
calls) as alternatives to `mapping_pair`. Uses `prec(2)` and a GLR conflict
declaration to resolve ambiguity with `unary_expr`.

| # | File | Status |
|---|------|--------|
| 1 | `Standards/URI.pike` | **FIXED** — `P(scheme)` accepted as mapping element |
#### KL-007e: Multi-line #"..." string literals — PARTIALLY RESOLVED in Round 16

Pike's hash-string syntax `#"..."` produces a string where the content
between `#"` and `"` includes literal newlines and backslash sequences.
The original regex `seq('#"', repeat(choice(/[^"\\]/, /\\\./)), '"')`
worked for simple hash-strings but failed when the content contains
backslash-newline combinations or preprocessor-like syntax.

**Round 16 fix**: External scanner (src/scanner.c) replaces the regex.
The scanner handles backslash escapes, literal newlines, and EOF correctly.
Also added `$.hash_string` to `string_concat` to support juxtaposition
(`#"hello" "world"` concatenation pattern).

| # | File | Location | Status |
|---|------|----------|--------|
| 1 | `Tools/Standalone/precompile.pike` | line 2149 | **FIXED** — external scanner handles `#"\n#ifdef..."` |
| 2 | `bin/install.pike` | line 1533 | **NOT HASH-STRING** — root error is `RELAY(X)` macro arguments (KL-007c) |
#### KL-007f: tds.pike — GLR state machine structural change

tds.pike has `protected { protected string string_to_utf16(string s) { ... } }` —
a function declaration with a redundant `protected` modifier inside a `protected {}` block.

**Round 20**: Four rule variants were tried:
1. Separate `modified_local_function_decl` rule (no precedence)
2. Same with `prec.dynamic(1)`
3. Adding `repeat($._modifier)` to existing `local_function_decl`
4. Extending `local_declaration` with function form alternative

All four produce the same regression: sslfile.pike fails from line 815 (instead of
baseline line 848), spanning ~1460 lines. Root cause: sslfile.pike has ~49
modifier-prefixed declarations in deeply nested GLR parse contexts. Any new parse
path from `modifier + type + name` to a function form creates exponential state
exploration at each occurrence.

This is NOT a precedence conflict — it's a structural change to the GLR state
machine's FIRST set that cascades through sslfile.pike's modifier occurrences.

| # | File | Location | Issue |
|---|------|----------|-------|
| 1 | `Sql/tds.pike` | lines 189, 193 | `protected string f()` inside `protected {}` block |
#### KL-007g: install.pike — RELAY juxtaposition

`RELAY(X)` expands to `" " #X "=" + TRVAR(X)+` — a string concatenation with
trailing `+`. Without expansion, tree-sitter sees `RELAY(TMP_LIBDIR) RELAY(LIBDIR_SRC)`
as two function calls with no operator between them.

The syntactic context is inside an `add_expr` (`+` chain for string cmd = ...).
After `+`, the parser expects `primary_expr`. `RELAY(X)` parses as `postfix_expr`
(function call), not `macro_invocation`, because the parser prefers the standard
function-call path.

Adding `seq($.macro_invocation, repeat1($.macro_invocation))` to `string_concat`
causes 1 test failure: `CBFUNC(a, b) CBFUNC(c, d)` at top level gets incorrectly
parsed as `string_concat` instead of two separate statements. The narrow-position
approach fails because `string_concat` is in `primary_expr`, which is valid at both
expression-interior and statement-boundary positions.

The ambiguity between `macro_invocation sequence` and `two separate statements`
is unresolvable with tree-sitter's GLR parser because both parses are valid from
the grammar's perspective.

| # | File | Location | Issue |
|---|------|----------|-------|
| 1 | `bin/install.pike` | line 1533 | `RELAY(X) RELAY(Y)` in `+` chain, no operator between |

#### KL-007h: sslfile.pike and client.pike — if-statement as macro argument

sslfile.pike: `RUN_MAYBE_BLOCKING(cond, 0, 1, if(sizeof(read_buffer)){...} else RETURN(0);)`
client.pike: `IF_ELSE_PAGED_SEARCH(if(supported_controls[...]){...},)`

**Round 20**: Three approaches were tried:

(a) **macro_call with uppercase callee**: tree-sitter cannot conditionally match
based on identifier case. Both `RUN_MAYBE_BLOCKING` and `regularFunction` match
the same `identifier` token. No grammatical distinction is possible without a
separate token class for uppercase identifiers (which would require lexer changes
that conflict with `word: $ => $.identifier`).

(b) **if_statement in argument_list**: adding `$.if_statement` to `argument_list`
makes every function call accept if/else as an argument. This creates ambiguity
at every call site: `f(if(x){a;}else b;)` is ambiguous between function-call-with-
if-arg and expression-statement-with-orphaned-else. The `;` inside the if body
creates ambiguity with expression_statement termination.

(c) **macro_invocation_stmt in _stmt**: adding `$.macro_invocation_stmt` to `_stmt`
causes 13 test regressions. The `macro_argument_list` path wins over
`expression_statement` for regular function calls, breaking:
  - catch/gauge expressions (parsed as macro_invocation instead of catch_expr)
  - for/foreach statements (compound patterns disrupted)
  - spread calls, chained calls (matched as macro_invocation)
  - declaration-in-condition patterns (if/while conditions disrupted)
  - existing macro_statement pattern (macro_statement vs macro_invocation_stmt conflict)

The core issue: `RUN_MAYBE_BLOCKING` calls are inside `_stmt` contexts (if/else
bodies) where only `expression_statement` with `argument_list` is available.
`macro_invocation_stmt` (which uses `macro_argument_list` accepting `if_statement`)
is only in `_definition` (top level), not `_stmt`.

| # | File | Location | Issue |
|---|------|----------|-------|
| 1 | `SSL/sslfile.pike` | line 848 | `RUN_MAYBE_BLOCKING` 4th arg = `if/else` statement |
| 2 | `Protocols/LDAP/client.pike` | line 1461 | `IF_ELSE_PAGED_SEARCH` 1st arg = `if` statement, 2nd arg empty |
### KL-008: Invisible modifier nodes in declarations — RESOLVED in Round 21
- **Original claim**: Declaration modifiers (`protected`, `private`, `public`,
  etc.) are consumed by the hidden `_modifier` rule and produce no named
  child nodes. Downstream consumers cannot see which modifiers were applied.
- **Resolution**: Renamed `_modifier` to `modifier` (removed underscore prefix).
  Modifier nodes now appear as named children in `declaration` nodes. The
  `node-types.json` includes the `modifier` entry. No regressions in corpus
  tests or distribution parse rate.
- **Removed**: Round 21

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
