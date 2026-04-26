# Scope Decision: External Scanner for Preprocessor Pairing

**Date**: Round 15 (2026-04-26)
**Status**: Approved — design complete, implementation deferred to Round 16

## Decision

Grammar-only was Phase 1 (reached 98.2% in Round 13). Phase 2 is an external
scanner for preprocessor conditional pairing and hash-string tokenization.
Phase 2 targets 99.1%+ distribution parse rate.

## Reasoning

### Why an external scanner is now justified

Round 14 proved the grammar-only ceiling exists at 98.2%. Round 15's
sub-categorization shows that the remaining 16 error files split into clear
categories:

| Category | Files | Scanner-fixable? |
|----------|-------|------------------|
| KL-007a: PP splitting expressions | 5 | Yes |
| KL-007b: PP splitting control flow | 5 | Yes (most) |
| KL-007c: Macro argument shapes | 5 | Partial (grammar fixes) |
| KL-007d: P(X) mapping pair | 1 | No |
| KL-007e: Hash-string lexer | 2 | Yes |
| KL-007f: Bare macro | 1 | No |

The scanner addresses KL-007a (5 files), KL-007b (3-5 files), and KL-007e
(2 files) — 10-12 files total. With the 3 KL-007c grammar fixes already
shipped, this brings the predicted rate to 99.1-99.4%.

### Cost assessment

1. **C code in `src/scanner.c`**: ~200-300 lines. The tree-sitter-al reference
   implementation for preprocessor depth tracking is ~100 lines. Pike's scanner
   adds hash-string handling and string/comment skipping.
2. **Build complexity**: tree-sitter CLI auto-compiles `src/scanner.c`. No
   additional build steps.
3. **Maintenance**: Scanner state is 1 byte (nesting depth). Serialization is
   trivial. Changes to preprocessor handling affect the scanner, not the
   grammar's preprocessor rules.
4. **Testing**: External tokens are testable through corpus tests. The scanner
   design includes 6+ corpus tests.
5. **Tree fidelity**: `PREPROC_BLOCK` is opaque — no structured tree inside
   conditional blocks. Acceptable tradeoff: downstream consumers that need
   inside-`#if` detail would use the Pike compiler, not tree-sitter.

### Previous incorrect scope decision

An earlier version of this document declared "maintenance cadence" and chose
not to build the scanner. That decision was based on an incomplete analysis
that underestimated the scanner's fixable scope (8 files vs. the actual 10-12)
and overestimated the maintenance cost of a 1-byte-state scanner.

## Phase 2 Plan

### Design (Round 15, this document)

1. KL-007 sub-categorization with exact token sequences — DONE
2. Scanner design document (`docs/scanner-design.md`) — DONE
3. Independent grammar fixes for KL-007c — DONE (3 files fixed)
4. No scanner code written — confirmed

### Implementation (Round 16)

1. Implement `src/scanner.c` per the design document
2. Modify `grammar.ts`: add `externals`, modify `primary_expr`, `_definition`,
   `_stmt`, remove conditional directives from `preprocessor_directive` extras
3. Add corpus tests from the design's test plan
4. Run distribution parse, verify no regressions
5. Success criterion: 99.1%+ (1072+/1082 clean files)

### Post-implementation

- If scanner hits 99.1%+: validate the approach, close KL-007a and KL-007e
- If scanner falls below 99.0%: post-mortem, revise or abandon
- Remaining errors (KL-007c/d/f) are not scanner-addressable — evaluate
  per-case whether further grammar fixes are worth the conflict cost

## Predicted Round 16 Shape

Round 16 starts from `docs/scanner-design.md` and produces:
- `src/scanner.c` implementation
- Grammar rule additions for `PREPROC_BLOCK` and `HASH_STRING`
- 6+ corpus tests covering scanner behavior
- Distribution parse results matching or exceeding the predicted rate

Round 16's success criterion is matching or exceeding 99.1% from the design
doc prediction. If the design predicts 99.1% and implementation hits 99.1%+,
the scanner approach is validated. If it falls short, Round 16 produces a
post-mortem — the same way Round 14 did for the grammar-only approach.
