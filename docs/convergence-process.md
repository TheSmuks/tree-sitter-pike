# Convergence Testing Process

## History

### Rounds 1-9: Multi-Agent Design

Rounds 1 through 9 used seven parallel convergence agents, each analyzing the
grammar from a different angle (correctness, adversarial, coverage, AST design,
type system, conflicts, limitations). Each agent ran as an independent process.

This design had systemic problems:
- **Timeout failures**: Four of seven agents in Round 9 timed out before
  completing. Partial results could not be trusted.
- **Non-determinism**: Agent ordering, system load, and timeout timing varied
  between runs. "Converged" in one run could become "not converged" in the next.
- **No reproducibility**: Different seeds, different file ordering, different
  adversarial inputs on each run. No way to replay a specific convergence check.
- **Noisy output**: Seven separate reports had to be manually synthesized.
  Contradictions between agents went undetected.

### Round 10: Unified Harness

The multi-agent design was replaced with a single Python harness
(`convergence/harness.py`) that runs all analyses in one deterministic pass.

This was a **process change** from the original Round 10 specification, which
called for seven agents. The change was made because:

1. The timeout problem made the multi-agent approach unreliable. Four of seven
   Round 9 agents timed out, producing incomplete results that could not be
   trusted for a convergence claim.
2. A single process has deterministic execution order. No race conditions, no
   load-dependent timing.
3. All analyses share the same build artifact and corpus state. No risk of
   agents seeing different grammar versions.
4. The harness is seedable (`--seed N`) and reproducible.
5. Total execution time is under 30 seconds, versus 10+ minutes for seven
   agents with timeouts.

**What was lost**: The multi-agent design had independent failure domains —
one agent crashing didn't affect the others. The unified harness has a single
failure point. This is acceptable because the harness is a ~700-line Python
script with no external dependencies, and any crash produces a clear traceback.

**What was gained**: Reproducibility, determinism, complete coverage on every
run, machine-readable JSON output, and the ability to run the full convergence
check as a pre-commit hook.

## Current Process

The harness implements five mandatory checks:

1. **Example file parsing**: Enumerates all files in `examples/` at runtime
   using `Path.glob`. Parses each with `tree-sitter parse`. Any ERROR or MISSING
   node is a P1 finding.

2. **Adversarial input generation**: Generates N novel inputs from parameterized
   templates. Templates cover feature combinations, boundary conditions, and
   grammar paths with low corpus coverage. Seeded for reproducibility.
   Any ERROR or MISSING in generated inputs is a P1 finding.

3. **Known-limitations re-validation**: Reads `docs/known-limitations.md` and
   confirms each item still holds. Items fixed in previous rounds are removed.
   Items that no longer apply are escalated to P1.

4. **Uncovered grammar rules**: Extracts all named rules from `grammar.ts` and
   cross-references against node types found in corpus test parse trees.
   Rules not covered by any test are flagged as P2.

5. **Branch coverage**: For each `choice()` rule in the grammar, checks whether
   every alternative is exercised by at least one corpus test. Uncovered
   alternatives are flagged as P2.

### Convergence Criteria

- **P1 = 0**: No ERROR or MISSING nodes in example files, no ERROR in
  adversarial inputs, no escalated known limitations.
- **P2**: Listed but not blocking. Uncovered rules and branches are tracked
  for future work.
- **CONVERGED** means P1 = 0 under the current process. The convergence claim
  is qualified by the process version.

### Vocabulary

The term "agents" refers to the historical multi-agent design. The current
implementation is "the harness" (`convergence/harness.py`). Future process
changes (e.g., adding new analyses, changing the harness architecture) must
be flagged in the convergence report as changes, not folded into the
implementation status table.

## Running the Harness

```bash
cd tree-sitter-pike
python3 convergence/harness.py --round N --seed 42 --adversarial-count 55
```

Output: stdout summary + `convergence/roundN_report.json` (machine-readable).

## Coverage and Correctness Definitions

### 100% Coverage Definition

The grammar achieves 100% Pike 8 coverage when all four conditions hold:

1. **Rule coverage**: Every named rule in `grammar.ts` has at least one corpus test
   that exercises it. Measured by cross-referencing grammar rules against corpus
   test parse tree node types.

2. **Branch coverage**: Every alternative in every `choice()` rule is exercised by
   at least one corpus test. Measured by extracting alternatives from grammar.ts
   and checking corpus parse trees.

3. **Manual construct coverage**: Every language construct described in the Pike 8
   reference documentation maps to at least one grammar rule. Gaps are tracked in
   the coverage matrix (yacc rule → grammar rule → corpus test).

4. **Distribution parse rate**: Every `.pike` and `.pmod` file in the Pike 8 source
   distribution parses without ERROR or MISSING nodes. Files that fail are
   categorized by error pattern, and each distinct pattern is either fixed or
   documented as a known limitation.

### 100% Correctness Definition

The grammar achieves 100% correctness when both conditions hold:

1. **No precedence or associativity errors**: For a sampled set of files, operator
   expressions produce the correct tree shape. Verified by manual review of parse
   trees against Pike's expression semantics (matching the yacc precedence
   declarations).

2. **No structural errors**: Named nodes in the parse tree faithfully represent the
   language construct they claim to represent. Specifically:
   - Modifiers on declarations produce visible named nodes
   - Type annotations include all components (constraints, generic arguments)
   - Statement structures match the language semantics

### Measurement Strategy

- **Rule/branch coverage**: Automated by the harness on every run
- **Manual construct coverage**: Re-assessed when grammar rules change
- **Distribution parse rate**: Run on every significant grammar change
- **Correctness sampling**: Stratified by construct type — 5 files each for
  expressions, declarations, type system, class bodies, and control flow

### Convergence Criteria

- **P1 = 0**: No ERROR or MISSING nodes in example files, no ERROR in
  adversarial inputs, no escalated known limitations, no distribution files
  with ERROR/MISSING (excluding documented known limitations).
- **P2**: Listed but not blocking. Uncovered rules, branches, structural issues
  (invisible named nodes), and distribution files with errors from documented
  known limitations.
- **CONVERGED** means P1 = 0 under the expanded target (coverage + correctness
  + distribution). The convergence claim is qualified by the measurement criteria.
### Round 14: Preprocessor Redesign Attempt

Attempted to move from transparent-extras handling of `#if`/`#ifdef`/`#endif` to
structured `preproc_if` grammar rules, following tree-sitter-c's approach.

**What was tried:**
1. Removed `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`/`#endif` from the extras-based
   `preprocessor_directive` token.
2. Added explicit `preproc_if` rule at statement, definition, class_body positions.
3. Added `preproc_if_expr` rule at expression position (in `primary_expr`).
4. Added `preproc_if` as consequence/alternative in `if_statement`.
5. Added `preproc_if` to array/mapping/multiset literal contents.
6. Added `preproc_if` to `argument_list`.

**Result:** Regressed from 98.2% (1063/1082) to 94.3% (1021/1082) clean files.

**Why it failed:**
- `#if` in Pike can appear inside any syntactic construct: expressions, mapping
  literals, array literals, argument lists, switch cases, enum bodies, etc.
- Each position requires `preproc_if` as an alternative, which creates cascading
  GLR conflicts with existing expression ambiguities.
- The `preproc_if_in_mapping` variant (for `#if` inside mapping literals, which
  contain `mapping_pair` → `_expr`) produced infinite conflict cascades.
- tree-sitter-c works because C has a smaller position set (3 contexts with
  specialized variants). Pike's permissiveness makes the approach infeasible.

**Decision:** Reverted to the 98.2% extras-based baseline (commit `6180b02`,
tagged `pre-preproc-redesign`). Preprocessor conditionals remain as transparent
extras tokens. The 19 error files are documented in KL-007.

**Future path:** To exceed 98.2%, either:
(a) Add a permissive `preproc_skip` rule that swallows everything between `#if`
    and `#endif` as opaque text in specific positions (loses tree fidelity).
(b) Implement an external scanner that tracks `#if`/`#endif` nesting at the lexer
    level and handles split cases before the parser sees them.


### Round 15: Design and Prep for External Scanner

Round 14 proved the grammar-only ceiling exists at 98.2%. Round 15 is
design-and-prep: proper diagnosis of all error files, scanner design document,
and independent grammar fixes. No scanner code was written.

**Work completed:**

1. **KL-007 sub-categorization** (docs/known-limitations.md):
   All 16 error files diagnosed with `tree-sitter parse --debug` and exact
   token sequences at each failure point. Split into 6 sub-entries:
   - KL-007a: 5 files (PP splitting expressions) — scanner target
   - KL-007b: 5 files (PP splitting control flow) — scanner target
   - KL-007c: 5 files (macro argument shapes + adjacent macros) — grammar fixes
   - KL-007d: 1 file (P(X) mapping pair) — not scanner-addressable
   - KL-007e: 2 files (hash-string lexer) — scanner target
   - KL-007f: 1 file (bare macro) — not scanner-addressable

2. **Scanner design document** (docs/scanner-design.md):
   Complete design: tokens, state, grammar interaction, failure modes, test plan.
   Key decisions:
   - Opaque `PREPROC_BLOCK` token (not structured tokens) — avoids the
     per-position rule explosion that caused Round 14's regression.
   - Scanner tracks nesting depth (1 byte state) + string/comment opacity.
   - `HASH_STRING` token replaces regex for `#"..."` multi-line strings.
   - Conditional directives removed from extras, handled exclusively by scanner.
   - Predicted post-implementation rate: 99.1-99.4% (1072-1075/1082).
   - Reference implementation: tree-sitter-al (preprocessor depth tracking).

3. **Independent grammar fixes** (KL-007c, committed as cbe3f35):
   - Added `$.block` to `argument_list` — fixes FIX_ERRNOS, TEST_CODE, LR_GAUGE
   - Added `$.magic_identifier` to `argument_list` — fixes HANDLE keyword args
   - Removed `'bits'` from `magic_identifier` — was causing regression
   - 3 files fully fixed: TELNET.pmod, LR/module.pmod, GSSAPI/test.pike
   - 1 file partially fixed: SSL/sslfile.pike (fewer errors)

4. **Diagnosed unfixed patterns** (KL-007c remaining):
   - `PROXY(\`->, 0)`: Grammar interprets as function declaration, not macro call.
     Backtick operator as macro argument + type+macro declaration pattern.
   - `DO_IF_DEBUG(void|int nowarn)`: `void|int` parsed as bitor expression.
     Would require type syntax in argument_list — massive conflicts.
   - Both confirmed unfixable without macro expansion awareness.

5. **Scope decision** (docs/scope.md):
   Grammar-only was Phase 1 (98.2%). Phase 2 is external scanner.
   Target: 100% Pike 8 coverage, 100% correctness.
   Round 16 implements the scanner. Round 17+ closes remaining gaps.

**Result:** 1066/1082 clean (98.5%), 204/204 tests passing.
Up from 1063/1082 (98.2%). 3 files fully fixed by grammar changes.
No scanner code written. Design document ready for Round 16.

**Commits:**
- `1245f44`: docs: sub-categorize KL-007 into sub-entries
- `a6ced62`: docs: scope decision (later rewritten)
- `cbe3f35`: fix: accept blocks and magic_identifiers in argument_list
- `f1800ec`: docs: add Round 15 summary (later rewritten)
- `bd036a1`: docs: rewrite KL-007 sub-categorization per Round 15 spec

**Round 16 shape:** Implements the scanner from docs/scanner-design.md.
Success criterion: 99.1%+ (1072+/1082 clean files).

### Round 16: External Scanner Implementation

Round 15 designed the external scanner. Round 16 implemented it, discovering
that the PREPROC_BLOCK approach was architecturally flawed.

**Work completed:**

1. **PREPROC_BLOCK attempted and reverted**: The opaque block approach
   consumed entire `#if...#endif` blocks as single tokens. This prevented
   the parser from seeing code inside conditional blocks — a severe
   tree-fidelity regression affecting 224 of 1082 files. Reverted.

   Root cause: Tree-sitter's external scanner fires before the default lexer.
   When PREPROC_BLOCK is valid (which it is whenever primary_expr is expected,
   essentially all non-trivial parse states), the scanner consumes the block
   before transparent extras can handle individual directives.

2. **HASH_STRING scanner implemented** (src/scanner.c, 85 lines):
   - External token for `#"..."` multi-line string literals
   - Handles backslash escapes, literal newlines, EOF inside string
   - No state required (hash-string-only, no depth counter)

3. **Grammar changes**:
   - Added `externals: [$ => [$.hash_string]]`
   - Added `$.hash_string` to `primary_expr`
   - Added `$.hash_string` to `string_concat` (fixes juxtaposition regression)
   - Removed `seq('#"', ...)` from `string_literal` regex
   - Added placeholder `hash_string` rule (required by tree-sitter for externals)

4. **KL-007e resolved**: precompile.pike now parses cleanly.
   bin/install.pike reclassified: root error is RELAY() macro, not hash-string.

5. **Design doc updated**: docs/scanner-design.md §10 documents the
   PREPROC_BLOCK analysis and the revised scanner scope.

6. **Corpus tests**: 4 new tests for hash-strings (simple, multi-line,
   backslash escapes, juxtaposition with regular string). 208/208 pass.

**Result:** 1067/1082 clean (98.71%), 208/208 tests passing.
Up from 1066/1082 (98.52%). +1 file fixed, 0 regressions.

**Post-mortem on design prediction:**
The design doc predicted 99.1-99.4% (9-12 files fixed). Actual: +1 file.
The over-prediction was caused by:
- PREPROC_BLOCK was assumed viable but was architecturally flawed
- KL-007e was misclassified: bin/install.pike's root error is RELAY() macro,
  not hash-string
- The scanner's scope was reduced from 2 tokens to 1 after the PREPROC_BLOCK
  analysis

**Commits:**
- scanner.c, grammar.ts changes, test updates, doc updates

### Round 17: Grammar Fixes + Scanner Investigation

Round 16 concluded that 98.71% was the practical ceiling. Round 17
tested that claim by attempting the work that hadn't been done.

**Grammar fixes delivered:**

1. `mapping_literal` extended to accept `postfix_expr` (KL-007d):
   `P(scheme)` in mapping literals now accepted as macro-call element.
   Uses `prec(2)` + GLR conflict `[$.mapping_literal, $.unary_expr]`.
   Result: Standards/URI.pike now parses cleanly.

2. `parameter` type field accepts `macro_invocation`:
   `DO_IF_DEBUG(void|int nowarn)` in parameter position now parses.
   The `macro_invocation` wraps the macro name and arguments.

3. `macro_argument_list` accepts `seq(type, identifier)` pairs:
   Handles patterns like `DO_IF_DEBUG(void|int nowarn)` where the
   macro argument looks like a parameter declaration.

**Scanner investigation:**

Selective PREPROC_BLOCK was attempted. The design called for a scanner
that would only emit `PREPROC_BLOCK` at positions where PP splits occur.

Attempted designs:
- (a) Position-restricted: put PREPROC_BLOCK in primary_expr with
  `prec.dynamic(-1)`. Failed: tree-sitter's external scanner runs BEFORE
  the parser and cannot be influenced by dynamic precedence. When
  PREPROC_BLOCK is in `valid_symbols` (reachable from primary_expr via
  expression_statement), the scanner consumes ALL #if blocks, including
  those at statement boundaries. This regressed 116 files.
- (b) Content-aware: scan ahead to check if block is structurally
  incomplete. Failed: tree-sitter's lexer cannot look ahead without
  consuming tokens. The `advance()` method moves the lexer position
  irreversibly. If the scanner decides not to emit after scanning ahead,
  it can't undo the consumption.

Root cause: tree-sitter's scanner-parser architecture is single-pass.
The scanner produces tokens; the parser consumes them. There is no
feedback mechanism for the parser to tell the scanner "don't emit
PREPROC_BLOCK here, I'm at a statement boundary." This is a
fundamental tree-sitter limitation, not a design flaw in our scanner.

**Attempted but failed grammar fixes:**

- Bare identifier in `_definition` (KL-007f, Terminfo.pide MUTEX):
  Creates cascading GLR conflicts with `identifier_expr` in every
  expression context. Would need conflicts for every token that can
  follow an identifier (`.`, `->`, `(`, `[`, operators, etc.).

- `string_concat` extension with `macro_invocation` (install.pike, Types.pmod):
  `macro_invocation` has the same shape as function call (`IDENT(args)`),
  creating ambiguity with `postfix_expr`. Tree-sitter silently removes
  the new `string_concat` form from the parse table.

- `postfix_expr` in `string_concat` (same files):
  Creates infinite recursion via `primary_expr → string_concat →
  postfix_expr → primary_expr`.

**Result:** 1068/1082 (98.89%), 208/208 tests, 0 regressions.
Up from 1067/1082 (98.71%). +1 file (URI.pike) fixed.

**Commits:**
- d6e0584: parameter + macro_argument_list grammar fixes
- 69cda3b: mapping_literal fix (URI.pike)

**Remaining 14 error files — specific token-level analysis:**

PP-split files (tree-sitter architectural limit — scanner cannot be
position-aware):
- Audio/Codec.pmod: `#else` inside `&&` condition
- Sql/tds.pike: `protected {` emitted by `#if`
- Protocols/LysKOM/Raw.pike: `#if` inside string concatenation
- src/modules/_Stdio/socktest.pike: `#ifdef` inside comparison value
- Parser/LR/GrammarParser.pmod: `#ifdef` inside function argument
- src/post_modules/GTK1/make_example_image.pike: `#if` splitting if/else
- src/post_modules/GTK2/make_example_image.pike: same
- Concurrent.pmod: `#ifdef` splitting variable initializer
- SSL/sslfile.pike: RUN_MAYBE_BLOCKING with PP-split args
- Protocols/LDAP/client.pike: IF_ELSE_PAGED_SEARCH PP-split

Macro-adjacent (grammar cannot distinguish without semantic context):
- bin/install.pike: juxtaposed RELAY(X) RELAY(Y) — no operator between calls
- ASN1/Types.pmod: juxtaposed DEC_COMB_MARK GR("") — no operator between calls
- Debug/Subject.pike: `void PROXY(destroy, 0);` — function_decl vs macro_stmt

Bare identifier:
- Stdio/Terminfo.pmod: bare MUTEX without `;` — creates cascading GLR conflicts

### Round 18: Targeted fixes + PP-split scanner investigation

Round 17 claimed 14 files were "hard limits." Round 18 tested that claim by
diagnosing each file with `tree-sitter parse --debug` and attempting fixes.

**Grammar fixes delivered:**

1. **Typed macro invocation in declaration** (Debug/Subject.pike):
   `void PROXY(destroy, 0);` — added `seq(type, macro_invocation_stmt)` to
   `declaration`. Requires 2 conflict declarations:
   `identifier_expr vs macro_invocation` and `macro_argument_list vs parameter`.
   Result: 40 ERROR nodes eliminated. File parses cleanly.

2. **Bare identifier with optional semicolon** (Stdio/Terminfo.pmod):
   `MUTEX` macro expands to nothing in non-threaded builds. Changed
   `seq($.identifier, ';')` to `seq($.identifier, optional(';'))` in declaration.
   Requires 5 conflict declarations due to cascading IDENT ambiguity:
   `string_concat vs declaration`, `_id_expr vs declaration`,
   `identifier_expr + _id_expr vs declaration`, `inherit_specifier vs declaration`,
   `declaration` (self). Result: file parses cleanly.

3. **string_concat accepts macro_invocation** (ASN1/Types.pmod 7.8):
   `DEC_COMB_MARK GR("")` — adjacent macro calls producing string concatenation.
   Added `seq(identifier, macro_invocation, repeat(...))` to `string_concat`.
   Requires 2 conflict declarations:
   `string_concat + _id_expr + declaration` and `string_concat + macro_invocation`.
   Result: file parses cleanly.

**Scanner investigation: valid_symbols-aware PREPROC_BLOCK**

Two scanner designs were tested for PP-split files:

(a) PREPROC_BLOCK in `primary_expr` (Round 17 approach):
   Failed — regressed 221 files. When PREPROC_BLOCK is in primary_expr,
   valid_symbols includes it at all statement boundaries via
   expression_statement → comma_expr → ... → primary_expr.
   The scanner sees valid_symbols[PREPROC_BLOCK]=true and fires for ALL
   #if blocks, including those at statement boundaries that should be
   transparent extras.

(b) PREPROC_BLOCK in `_expr` (Round 18 approach):
   No regression (1071 clean, same as baseline). But also no improvement.
   The scanner never fires because transparent extras consume `#ifdef`
   BEFORE the external scanner is called.

**Token-level failure for PP-split:**

Tree-sitter's processing order: (1) external scanner, (2) regular tokens,
(3) transparent extras. When the parser is at `if (x >` and the next token
is `#ifdef`, both PREPROC_BLOCK (external scanner) and preprocessor_directive
(transparent extra) match. Tree-sitter processes transparent extras first.
The `#ifdef` line is consumed as a `preprocessor_directive` node, and the
scanner is never called.

The fix would require removing `preprocessor_directive` from extras, which
would break all 221+ files that use PP directives at statement boundaries.
This is the scanner catch-22: the same mechanism that handles PP directives
correctly at statement boundaries prevents the scanner from handling them
inside expressions.

**tds.pike — GLR conflict with sslfile.pike:**

`protected { protected string f() { } }` — adding `repeat($._modifier)` to
`local_function_decl` or adding `seq(repeat1($._modifier), $.function_decl)`
to `_stmt` causes sslfile.pike to regress from a 1-line ERROR (line 848)
to a 1462-line ERROR (lines 815-2277). The specific GLR conflict:
- `local_function_decl` with modifiers has the same prefix as `declaration` →
  `function_decl` (both: modifier* type name)
- The new GLR state for modified function_decl interferes with the transition
  from `macro_statement` (} LEAVE;) back to declaration scope
- At line 815 of sslfile.pike, `string read(...)` is misinterpreted
Count: 4 specific conflict messages, all requiring the same `declaration`
self-conflict that creates the cascade.

**install.pike — RELAY juxtaposition:**

`RELAY(X) RELAY(Y)` in a `+` concatenation chain. Each `RELAY(X)` expands to
include a trailing `+`. Without expansion, the parser sees two function calls
with no operator between them. The `string_concat` extension handles
`IDENTIFIER MACRO_INVOCATION` but not `POSTFIX_EXPR POSTFIX_EXPR` — because
`RELAY(X)` is parsed as `postfix_expr(argument_list)`, not `macro_invocation`.
The parser prefers the standard function-call interpretation over macro_invocation.
Accepting adjacent postfix_expr would create unbounded ambiguity (any two
expressions could be "concatenated").

**Result:** 1071/1082 (99.0%), 208/208 tests, 0 regressions.
Up from 1068/1082 (98.89%). +3 files fixed in this round.

**Commits:**
- 5903bee: typed macro invocation in declaration (Subject.pike)
- 90048bb: bare identifier with optional semicolon (Terminfo.pmod)
- 56c5ac1: string_concat accepts macro_invocation (ASN1/Types.pmod)

**Remaining 11 error files — token-level classification:**

PP-split (transparent extras consume #ifdef before scanner fires):
- Audio/Codec.pmod: `fc->type == #if ... EXPR #else EXPR #endif`
- Concurrent.pmod: `string x = #ifdef ... EXPR #else EXPR #endif ;`
- GrammarParser.pmod: `ErrorHandler(#ifdef ... 1 #else 0 #endif)`
- LysKOM/Raw.pike: `whoami|| #if ... EXPR #else EXPR #endif "%"` (double split)
- socktest.pike: `oob_sent > #ifdef ... 5 #else 511 #endif )`
- GTK1/make_example_image.pike: `if(X) #if ... STMT #else STMT #endif else STMT`
- GTK2/make_example_image.pike: same pattern

GLR conflict (adding modifier to local_function_decl regresses sslfile.pike):
- Sql/tds.pike: `protected { protected string f() { } }` — function_decl in
  protected block with redundant modifier

Macro args containing control flow:
- SSL/sslfile.pike: `RUN_MAYBE_BLOCKING(...)` with if/else blocks in args
- LDAP/client.pike: `IF_ELSE_PAGED_SEARCH(if(...) {...}, ...)` — statements as args

RELAY juxtaposition:
- bin/install.pike: `EXPR + RELAY(X) RELAY(Y) + EXPR` — postfix_expr adjacency