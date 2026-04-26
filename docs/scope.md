# Scope Decision: External Scanner

**Date**: Updated Round 16 (2026-04-26)
**Status**: Scanner implemented (hash-string only). PREPROC_BLOCK dropped.

## Decision

Round 16 implemented the external scanner per docs/scanner-design.md. The
PREPROC_BLOCK token was found to be architecturally incompatible with the
transparent extras approach and was dropped. The scanner only implements
HASH_STRING.

## What happened in Round 16

1. **PREPROC_BLOCK attempted and reverted**: The opaque block approach was
   implemented and tested. It consumed entire `#if...#endif` blocks as single
   tokens, preventing the parser from seeing the code inside. This would have
   regressed tree fidelity for 224 files that contain conditional directives.

2. **HASH_STRING implemented**: The external scanner for `#"..."` multi-line
   strings replaces the regex-based tokenization. This fixed 1 file
   (precompile.pike) without regressions.

3. **string_concat updated**: Added `$.hash_string` to the `string_concat`
   rule to support hash-string juxtaposition with regular strings.

## Current state

- Parse rate: 1067/1082 (98.71%)
- Error files: 15 (down from 16)
- Scanner scope: hash-string tokenization only
- PREPROC_BLOCK: not viable, documented in scanner-design.md §10

## Remaining errors are architectural

All 15 remaining error files require one of:
- Macro expansion (the scanner cannot expand macros)
- Opaque preprocessor blocks (rejected due to tree-fidelity regression)
- Type syntax in macro arguments (creates massive GLR conflicts)

These are not fixable within tree-sitter's grammar-only architecture.

## Post-Round 16 status

The project is in maintenance cadence. The external scanner handles hash-strings.
No further scanner expansions are planned. The 98.71% rate represents the
practical ceiling for a tree-sitter grammar without macro expansion or opaque
preprocessor blocks.
