# Ceiling Decision: 11 Unparseable Files

**Status**: Architectural ceiling declared at Round 20.
**Rate**: 1071/1082 (99.0%) Pike 8 distribution coverage.
**Date**: 2026-04-26

## Summary

The remaining 11 files cannot be parsed by the current architecture. Each falls
into one of four categories, and for each category, this document evaluates the
three possible resolutions:

- **(a)** Parser-internal lookahead in the external scanner (tree-sitter doesn't provide)
- **(b)** Hand-written preprocessing transformation
- **(c)** Accept as a documented gap

## Category 1: PP-split expressions (7 files)

**Files:**
| # | File | Location | Pattern |
|---|------|----------|---------|
| 1 | `Audio.pmod/Codec.pmod` | line 69 | `fc->type == #if ... #endif` |
| 2 | `Concurrent.pmod` | line 1239 | `private string x = #ifdef ... #endif ;` |
| 3 | `Parser.pmod/LR.pmod/GrammarParser.pmod` | line 327 | `ErrorHandler(#ifdef ... 1 #else 0 #endif)` |
| 4 | `Protocols.pmod/LysKOM.pmod/Raw.pike` | line 336 | `whoami \|\| #if ... #endif` |
| 5 | `src/modules/_Stdio/socktest.pike` | line 397 | `oob_sent > #ifdef ... #else ... #endif` |
| 6 | `src/post_modules/GTK1/make_example_image.pike` | line 65 | `if(cond) #if ... return 1; #else ... #endif else ...` |
| 7 | `src/post_modules/GTK2/make_example_image.pike` | line 75 | Same pattern as GTK1 |

**Root cause**: `#if`/`#ifdef`/`#endif` blocks split sub-expressions. The preprocessor
directives are transparent extras consumed between tokens. When they appear inside
an expression (e.g., as the RHS of `==`), tree-sitter sees a dangling operator with
no right operand.

**Attempted fixes:**
- Round 18: Transparent extras consume PP tokens before scanner (WRONG — scanner fires first)
- Round 19: valid_symbols position analysis — PP tokens valid at too many positions
- Round 20: STMT_BOUNDARY_MARKER + PREPROC_BLOCK — fixed 4 files, regressed 15

**Resolution: (b) — Preprocessor pass feasible for specific patterns**

A preprocessing pass could resolve these by replacing PP blocks with placeholder
expressions. The transformation would need to:

1. Identify `#if`/`#ifdef`/`#ifndef`...`#else`...`#endif` blocks inside expressions.
2. Replace each block with a single representative value:
   - For `#ifdef X val1 #else val2 #endif`: replace with `val1` (or `val2`)
   - For `#if cond val1 #else val2 #endif`: replace with `val1`
   - For `#ifdef X val1 #endif`: replace with `val1`
3. Emit the transformed source for tree-sitter parsing.

This is NOT full CPP — it's a 20-line transformation targeting the specific pattern
of PP-split expressions. The 7 files use a small number of patterns:
- PP as operator RHS (4 files): `expr OP #ifdef A val1 #else val2 #endif`
- PP as function argument (1 file): `func(#ifdef A val1 #else val2 #endif)`
- PP wrapping if-then clause (2 files): `if(c) #if A ... #else ... #endif else ...`

The preprocessing pass would need to parse PP directives (trivial regex) and
understand expression boundaries (need brace/paren/bracket depth tracking).

## Category 2: GLR state machine structural change (1 file)

**File:** `Sql.pmod/tds.pike` (lines 189, 193)
**Pattern:** `protected string f() { ... }` inside `protected { }` block

**Root cause:** Adding `modifier + type + name → function_decl` as a parse path in
`_stmt` changes the GLR state machine's FIRST set. This creates new states that
overlap with `local_declaration` at every modifier occurrence in sslfile.pike (~49
locations), causing exponential state exploration and a regression from 1-line ERROR
to ~1460-line ERROR.

**Attempted fixes:**
- Round 19: Three `prec.dynamic` variants — all regressed sslfile.pike
- Round 20: Four rule variants (separate rule, prec.dynamic, extend existing, new
  alternative in local_declaration) — all regressed sslfile.pike identically

**Resolution: (c) — Accept as documented gap**

This is a fundamental GLR state machine interaction. No grammar-level fix can add
the modifier+function_decl path without changing the FIRST set for the `modifier +
type + name` prefix, which cascades through sslfile.pike's dense modifier usage.

The only resolution would be (a) — if tree-sitter provided a way to constrain GLR
exploration (e.g., beam search, state pruning), this could work. That's an upstream
tree-sitter change, not a grammar change.

## Category 3: RELAY juxtaposition in + chain (1 file)

**File:** `bin/install.pike` (line 1533)
**Pattern:** `RELAY(TMP_LIBDIR) RELAY(LIBDIR_SRC)` — two macro invocations with no
operator between them, inside a `+` string concatenation chain.

**Root cause:** After `+`, the parser expects `primary_expr`. `RELAY(X)` parses as
`postfix_expr` (function call). A second `RELAY(Y)` after it is not a valid
continuation — there's no operator. The actual Pike code works because `RELAY`
expands to `" " #X "=" + TRVAR(X)+`, making the juxtaposition resolve to string
concatenation after macro expansion.

**Attempted fixes:**
- Round 19: `macro_invocation_sequence` in `string_concat` — caused 1 test regression
  (`CBFUNC(a, b) CBFUNC(c, d)` at top level parsed as string_concat instead of
  two separate statements)
- Round 20: Not retried (same fundamental ambiguity)

**Resolution: (b) — Preprocessor pass feasible**

A preprocessing pass could:
1. Recognize adjacent `RELAY(X) RELAY(Y)` patterns (or any adjacent `MACRO(args) MACRO(args)`)
2. Insert `+` between them: `RELAY(X) + RELAY(Y)`

This requires knowing which identifiers are macros with string-returning expansions.
For `install.pike` specifically, it's the `RELAY` macro. A generic solution would
need macro definition analysis, which is beyond a simple pre-pass.

Alternatively: **(c)** — accept. This is one file with one specific macro pattern.

## Category 4: if-statement as macro argument (2 files)

**Files:**
| # | File | Location | Pattern |
|---|------|----------|---------|
| 1 | `SSL.pmod/sslfile.pike` | line 848 | `RUN_MAYBE_BLOCKING(cond, 0, 1, if(...){...} else RETURN(0);)` |
| 2 | `Protocols.pmod/LDAP.pmod/client.pike` | line 1461 | `IF_ELSE_PAGED_SEARCH(if(supported_controls[...]){...},)` |

**Root cause:** These macro calls are inside `_stmt` contexts (if/else bodies), where
only `expression_statement` → `postfix_expr` → `argument_list` is available. The
`argument_list` doesn't accept `if_statement`. The `macro_invocation_stmt` path
(which uses `macro_argument_list` accepting `if_statement`) is only in `_definition`,
not `_stmt`.

**Attempted fixes:**
- Round 19: Added `$.if_statement` to `macro_argument_list` — didn't help because
  the calls are parsed as `postfix_expr`, not `macro_invocation_stmt`
- Round 20: Three approaches:
  - (a) macro_call with uppercase callee — tree-sitter can't distinguish by case
  - (b) if_statement in argument_list — creates ambiguity at every call site
  - (c) macro_invocation_stmt in _stmt — causes 13 test regressions

**Resolution: (c) — Accept as documented gap**

No grammar-level fix can distinguish macro calls from function calls at `_stmt`
level without either:
- Requiring tree-sitter to match based on identifier case (not supported)
- Adding `if_statement` to every `argument_list` (massive ambiguity)
- Adding `macro_invocation_stmt` to `_stmt` (13 test regressions)

A preprocessing pass (b) could resolve these by recognizing the specific macro
names and transforming `MACRO(args including if_stmt)` into a different syntax,
but this requires macro-specific knowledge and would be fragile.

## Decision Table

| Category | Files | Option (a) | Option (b) | Option (c) |
|----------|-------|------------|------------|------------|
| PP-split expressions | 7 | Not available | Feasible, small effort | Default |
| GLR structural change | 1 | Requires upstream tree-sitter | N/A | Default |
| RELAY juxtaposition | 1 | Not available | Feasible, macro-specific | Default |
| if-stmt as macro arg | 2 | Not available | Fragile, macro-specific | Default |

**Default for v1.0.0**: Option (c) for all 11 files.

**Future work** (v1.x):
- Category 1: A PP-expression pre-pass is the most feasible improvement. It would
  close 7 files with a bounded, well-defined transformation.
- Category 3: A macro-specific pre-pass for `RELAY` is trivial but low-value (1 file).
- Categories 2 and 4: No resolution without upstream tree-sitter changes.
