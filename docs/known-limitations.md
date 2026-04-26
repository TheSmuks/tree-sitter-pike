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

- **Last validated**: Round 16
- **Rounds active**: 5
- **Impact**: 15 distribution files have errors:
  - KL-007a: 5 files (PP splitting expressions) — **not scanner-addressable**
  - KL-007b: 5 files (PP splitting control flow) — **not scanner-addressable**
  - KL-007c: 4 remaining files (macro argument shapes) — **not scanner-addressable**
  - KL-007d: 1 file (P(X) mapping pair) — **not scanner-addressable**
  - KL-007e: 0 remaining files (hash-string) — **RESOLVED in Round 16**
  - KL-007f: 1 file (bare macro) — **not scanner-addressable**
  - Some files appear in multiple sub-entries (total unique: 15)
#### KL-007a: PP splitting expressions (5 files) — Not scanner-addressable

The `#if`/`#ifdef`/`#endif` block splits a sub-expression so that neither
branch is a complete expression. Tree-sitter sees a dangling operator with
no right operand (or a value with no operator). The scanner can fix all of
these by consuming the entire `#if`...`#endif` block and presenting it as a
single expression that the grammar can place in `primary_expr`.

| # | File | Location | What is split | Token sequence at failure |
|---|------|----------|---------------|---------------------------|
| 1 | `Concurrent.pmod` | line 1239 | Variable initializer | `private string orig_backtrace =\n#ifdef CONCURRENT_DEBUG\n  sprintf(...)\n#else\n  ""\n#endif\n;` |
| 2 | `Parser/LR/GrammarParser.pmod` | line 327 | Function call argument | `ErrorHandler(\n#ifdef LR_DEBUG\n  1\n#else\n  0\n#endif\n)` |
| 3 | `Protocols/LysKOM/Raw.pike` | line 336 | `||` right operand in string concat | `whoami||\n#if constant(...)\n  expr\n#else\n  "*unknown*"\n#endif` |
| 4 | `src/_Stdio/socktest.pike` | line 397 | `>` right operand in `if` condition | `oob_sent >
#ifdef OOB_DEBUG
  5
#else
  511
#endif
)` |
| 5 | `Audio/Codec.pmod` | line 69 | `==` right operand in `&&` condition | `fc->type ==
#if constant(_Ffmpeg.AVMEDIA_TYPE_AUDIO)
  _Ffmpeg.AVMEDIA_TYPE_AUDIO
#else
  _Ffmpeg.CODEC_TYPE_AUDIO
#endif
)` |

**Scanner resolution**: The scanner consumes the entire `#if`/`#endif` block
as a `preproc_block` token. The grammar places this in `primary_expr`, so
the parser sees `oob_sent > [expr]` where `[expr]` is the opaque block.
Tree fidelity inside the block is lost — this is the tradeoff for correctness.

**Grammar-only path**: Adding `preproc_if` to `primary_expr` (as
`preproc_if_expr`) works for simple cases but fails when the `#if`/`#endif`
block is nested inside a larger expression context like `&&` or `||`.
Round 14 confirmed this.

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

#### KL-007d: Macro expansion producing mapping/array members (1 file) — Not scanner-addressable

A macro invocation `P(X)` expands to `"X":X` — a mapping pair. Without
macro expansion, tree-sitter sees `P(scheme)` as a function call, not a
mapping pair. This is fundamentally unfixable without macro expansion awareness.

| # | File | Location | Pattern | Token sequence |
|---|------|----------|---------|----------------|
| 1 | `Standards/URI.pike` | line 649 | `#define P(X) #X:X` used in mapping literal | `([\n  P(scheme),\n  P(authority),\n  ...\n])` |

The ERROR spans 52 lines (649-701) because the entire mapping literal fails
to parse when `P(scheme)` is not recognized as a mapping pair.

**Note**: The files `ASN1/Types.pmod` and `bin/install.pike` have adjacent
macro invocations producing implicit string concatenation (`DEC_COMB_MARK GR("\300")`
and `RELAY(X)` chains). These are similar — the grammar sees two expressions
with no operator between them. Also not scanner-addressable.

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
#### KL-007f: Bare macro identifiers expanding to nothing (1 file) — Not scanner-addressable

| # | File | Location | Issue |
|---|------|----------|-------|
| 1 | `Stdio/Terminfo.pmod` | line 15 | `MUTEX` expands to empty or to a full declaration; tree-sitter sees a bare identifier without semicolon |

`MUTEX` is defined (or not) by a preprocessor conditional. When not defined,
it's a bare identifier at the top level with no semicolon. The grammar
already accepts `IDENTIFIER;` as `macro_statement` but `MUTEX` without `;`
doesn't match. Accepting bare identifiers without `;` would create conflicts
with every other use of identifiers.

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
