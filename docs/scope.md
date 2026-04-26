# Scope Decision: Grammar-Only vs External Scanner

**Date**: Round 15 (2026-04-26)
**Status**: Approved

## Decision

Grammar-only was Phase 1. Phase 2 is targeted grammar fixes for the
macro-argument category (KL-007c). An external scanner for preprocessor
pairing is architecturally available but not justified by the marginal
improvement at this time.

After Phase 2, the project enters maintenance cadence.

## Reasoning

### What an external scanner would fix

An external scanner that tracks `#if`/`#endif` nesting and emits structured
tokens would address:

- **KL-007a** (5 files): PP splitting expressions. A scanner that emits a
  single opaque `preproc_block` token would allow the grammar to accept
  `#if`/`#endif` inside expressions. Cost: the parse tree inside the
  preprocessor block is lost — the content is an opaque blob.
- **KL-007e** (1 file): Hash-string with backslash-newline. A scanner that
  handles hash-string tokenization outside the regex engine.
- **Partially KL-007b** (2 of 5 files): The GTK if-then/else cases could be
  addressed if the scanner understands enough Pike syntax to recognize `if`
  statements. This is beyond simple nesting tracking.

Total: 8 of 19 error files at best. Parse rate improvement: 98.2% → ~98.9%.

### What an external scanner would NOT fix

- **KL-007c** (7 files): Macro argument shape issues. These are grammar
  rules that don't accept certain argument types (blocks, backtick operators,
  type syntax). A scanner emits tokens; it doesn't change which tokens the
  grammar accepts in argument position.
- **KL-007d** (2 files): Adjacent macro invocations producing implicit
  concatenation. Requires macro expansion awareness.
- **KL-007f** (1 file): Bare macro identifier expanding to nothing.
  A grammar-level decision about accepting bare identifiers.
- **KL-007b** (remaining 3 of 5 files): Modifier blocks, compound
  macro+preproc patterns, macro in parameter position.

### Cost of an external scanner

1. **C code in `src/scanner.c`**: Tree-sitter external scanners are written in
   C against tree-sitter's scanner API. This adds a compiled component to what
   is currently a pure grammar file.
2. **Build complexity**: The build process must compile and link the scanner.
   Currently, `tree-sitter generate` produces everything from `grammar.ts`.
   With a scanner, there's an additional compilation step.
3. **Maintenance**: C code doesn't benefit from tree-sitter's grammar DSL.
   Changes to preprocessor handling require editing both the grammar and the
   scanner. The scanner must be kept in sync with the grammar's token
   expectations.
4. **Testing**: External scanners require separate test strategies. The corpus
   test framework tests grammar rules, not scanner behavior directly.
5. **Tree fidelity loss**: The opaque `preproc_block` token approach means no
   parse tree inside preprocessor conditionals. This defeats the purpose of
   structured preprocessor handling for downstream consumers.

### Cost-benefit

| Path | Files fixed | Parse rate | Complexity cost |
|------|-------------|------------|-----------------|
| Phase 2 (grammar fixes) | 4-5 of 7 in KL-007c | ~98.5-98.7% | Low — grammar.ts edits only |
| External scanner | 8 of 19 | ~98.9% | High — C scanner + build changes |
| Both | 12-13 of 19 | ~99.2% | High |

The external scanner's marginal benefit over Phase 2 alone is 3-4 files
(98.9% vs 98.7%). The cost is disproportionate.

### Why not option (a) — grammar-only is permanent

Option (a) would mean accepting 98.2% as the permanent ceiling. But the
KL-007c analysis shows that 4-5 files are fixable with targeted grammar
changes to `macro_argument_list`. These are not preprocessor issues — they're
grammar bugs. Labeling them as "permanent" would be inaccurate.

## Phase 2 Plan

Fix the following KL-007c cases:

1. **`FIX_ERRNOS({...}, 0)`** — block followed by additional args
2. **`TEST_CODE({...})`** — block as sole variadic arg
3. **`LR_GAUGE("LR0", {...})`** — block as second arg after expression
4. **`HANDLE(remote,WILL,WONT,DO,DONT)`** — 5 bare identifier args

Cases that are NOT fixable in Phase 2 (document, don't attempt):

5. **`DO_IF_DEBUG(void|int nowarn)`** — type syntax as macro arg
6. **`P(X)` → `#X:X` mapping pair** — fundamentally requires macro expansion
7. **`void PROXY(\`->, 0);`** — backtick operator as macro arg + type+macro as declaration

Predicted Phase 2 result: 1067-1068/1082 clean (~98.5-98.7%).

## Maintenance Cadence

After Phase 2:

- **No scheduled rounds.** Rounds are triggered by:
  - Regression detected (parse rate drops below Phase 2 baseline)
  - New Pike release requiring grammar updates
  - New bug report from a downstream consumer
- **No new feature work.** The grammar handles Pike 8.0 comprehensively.
  Adding Pike 9.x support would be a new project phase.
- **Corpus growth is always in scope.** New test cases that exercise
  uncovered grammar paths can be added at any time without a round.

## External scanner: not never, just not now

If a downstream consumer needs structured preprocessor handling (e.g., an IDE
that wants to gray out inactive preprocessor branches), the external scanner
path is available. The design would be:

1. Track `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`/`#endif` nesting depth.
2. Emit structured tokens: `preproc_if_open`, `preproc_elif`, `preproc_else`,
   `preproc_endif`.
3. The grammar consumes these at statement/definition level (where they
   already work as extras) and at expression level (new `preproc_if_expr` rule).
4. At expression level, the scanner emits a single `preproc_block` token.
   The grammar places this in `primary_expr`. Content inside is opaque.

This design was not implemented because:
- The statement/definition level already works via extras.
- The expression level is the gap (KL-007a), but 5 files doesn't justify
  the scanner's complexity.
- The scanner cannot help with KL-007c/d/f, which are the majority of
  remaining errors after Phase 2.
