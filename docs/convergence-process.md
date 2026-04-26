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

**Round 17 status:** Maintenance cadence. No scheduled round.
All remaining errors are architectural (require macro expansion or opaque
preprocessor blocks, which are not viable). The 98.71% rate is the practical
ceiling for tree-sitter-pike without fundamental architecture changes.