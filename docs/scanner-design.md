# External Scanner Design for tree-sitter-pike

**Author**: Round 15 design document
**Status**: Design — NOT implemented. No scanner code exists.
**Target**: Round 16 implementation

## 1. Problem Statement

The current grammar handles preprocessor directives (`#if`, `#ifdef`, `#ifndef`,
`#else`, `#elif`, `#endif`) as transparent extras — they appear between any two
tokens and the parser ignores them. This works when directives appear at
statement or definition boundaries (the common case) but fails when they split
a syntactic structure mid-expression or mid-statement.

The regex-based `preprocessor_directive` token in extras cannot pair `#if` with
`#endif` — each directive is matched independently. This means the parser has no
way to know that the content between `#if` and `#endif` is a conditional block
that should be treated as a single unit.

An external scanner can track `#if`/`#endif` nesting and emit structured tokens
that the grammar consumes as complete units. This is the same approach
tree-sitter-al uses for its preprocessor handling.

Additionally, the hash-string syntax `#"..."` (Pike's multi-line string literal)
has a regex tokenization bug that an external scanner can fix.

## 2. Scope

### What the scanner does

1. **Pair preprocessor conditionals**: Track `#if`/`#ifdef`/`#ifndef` nesting
   depth and emit structured tokens that the grammar can consume as expressions
   or statements.
2. **Tokenize hash-strings**: Handle `#"..."` multi-line strings correctly,
   including backslash-newline sequences that break the current regex.

### What the scanner does NOT do

- **No macro expansion.** The scanner does not expand `#define` macros or
  evaluate `#if` conditions. It pairs directives structurally.
- **No cpp execution.** The scanner does not run the C preprocessor.
- **No Pike syntax understanding.** The scanner does not parse Pike code inside
  `#if` blocks. It treats block contents as opaque text.

## 3. Token Specification

### 3.1 Preprocessor tokens

The scanner emits the following tokens:

| Token | Description | Matches |
|-------|-------------|---------|
| `PREPROC_BLOCK` | Opaque block from `#if`/`#ifdef`/`#ifndef` through matching `#endif`, including `#else`/`#elif` branches | The entire conditional block as a single token |
| `PREPROC_ELSE` | Standalone `#else` directive (when not part of a `PREPROC_BLOCK`) | `#else` |
| `PREPROC_ELIF` | Standalone `#elif`/`#elseif` directive | `#elif ...` or `#elseif ...` |

**Design decision: `PREPROC_BLOCK` (opaque) vs. structured tokens.**

Two approaches were considered:

**Option A: Structured tokens** (`PREPROC_IF_OPEN`, `PREPROC_ELSE`,
`PREPROC_ELIF`, `PREPROC_ENDIF`) — The scanner emits individual tokens for each
directive, and the grammar constructs a `preproc_if` rule with `repeat(choice($._stmt, $._definition))` content.

**Option B: Opaque block** (`PREPROC_BLOCK`) — The scanner consumes the entire
`#if`...`#endif` block as a single token. The grammar places this in
`primary_expr` and at statement/definition level. Content inside is opaque.

**Choice: Option B (opaque block).**

Rationale:
1. Option A is what Round 14 tried (grammar-only) and it failed due to GLR
   conflicts. The scanner provides typed tokens but the grammar still needs
   `preproc_if` rules at every position where `#if` can appear — the same
   combinatorial explosion that caused the Round 14 regression.
2. Option B avoids the per-position problem entirely. The grammar needs exactly
   one new rule: `primary_expr` includes `PREPROC_BLOCK`. The opaque block
   represents "whatever the preprocessor would produce here" — which is the
   correct semantic for a non-expanding parser.
3. Tree fidelity inside the block is lost. This is an acceptable tradeoff:
   Pike IDEs that need to see inside `#if` blocks would use the Pike compiler
   for that, not tree-sitter. Tree-sitter's role is structural parsing for
   highlighting, navigation, and indentation — all of which work with opaque
   blocks.

**What `PREPROC_BLOCK` looks like in the parse tree:**

```pike
// Source:
if (oob_sent >
#ifdef OOB_DEBUG
    5
#else
    511
#endif
    ) { ... }

// Parse tree with PREPROC_BLOCK:
(if_statement
  condition: (parenthesized_expr
    (binary_expr
      left: (identifier_expr "oob_sent")
      operator: ">"
      right: (preproc_block "#ifdef OOB_DEBUG\n    5\n#else\n    511\n#endif")))
  consequence: (block ...))
```

The `preproc_block` node contains the raw text of the conditional block as a
single anonymous token. Downstream consumers can inspect the text but don't get
a structured tree inside it.

### 3.2 Hash-string token

| Token | Description | Matches |
|-------|-------------|---------|
| `HASH_STRING` | Pike `#"..."` multi-line string literal | `#"` ... `"`, including newlines and escape sequences |

This replaces the regex-based `#"..."` token in `string_literal`. The scanner
tracks the opening `#"` and scans for the closing `"` while handling:

- Backslash escapes (`\"`, `\\`, `\n`, etc.) — do not close the string
- Literal newlines — part of the string content
- Backslash-newline — line continuation inside the string
- EOF before closing `"` — incomplete string, emit what we have

### 3.3 Where does the condition expression end?

For `PREPROC_BLOCK`, the scanner does not parse the condition expression at all.
It matches the directive keyword (`#if`, `#ifdef`, `#ifndef`) and then scans for
the matching `#endif` by tracking nesting depth. The condition is part of the
opaque content.

For non-conditional directives (`#define`, `#include`, `#pragma`, etc.), the
scanner does NOT emit tokens — these remain as regex-based extras.

### 3.4 How are nested #if/#endif handled?

The scanner maintains a nesting depth counter:

1. On `#if`/`#ifdef`/`#ifndef`: increment depth. If depth was 0, start a new
   `PREPROC_BLOCK` token.
2. On `#elif`/`#elseif`/`#else`: if depth > 0, continue the current block.
3. On `#endif`: if depth > 0, decrement depth. If depth becomes 0, close the
   `PREPROC_BLOCK` token (emit it).

Nested `#if` inside `#if` increments depth to 2, then 3, etc. Only the
outermost `#endif` (depth back to 0) closes the token.

### 3.5 Directives inside string literals and comments

The scanner must NOT pair directives inside strings or comments. The scanner
must track whether it is inside:

1. **String literal** (`"..."`): Skip all content until the closing `"`,
   respecting backslash escapes. Do not pair `#if` inside a string.
2. **Hash-string** (`#"..."`): Same as string literal — the scanner handles
   hash-strings itself, so it knows when it's inside one.
3. **Block comment** (`/* ... */`): Skip all content until `*/`. Do not pair
   directives inside comments.
4. **Line comment** (`// ...`): Skip to end of line. A `#if` on the same line
   after `//` is in a comment and must not be paired.
5. **Autodoc comment** (`//! ...`): Same as line comment.

This is handled by a state machine in the scanner. While scanning for the
matching `#endif`, the scanner checks each character:
- If `"` → scan string (skip `\"` escapes)
- If `#"` → scan hash-string (same logic as standalone hash-string)
- If `/*` → scan block comment (track nesting for `/* /* */ */`)
- If `//` or `//!` → skip to end of line
- If `#` followed by `if`/`ifdef`/`ifndef` → increment depth
- If `#` followed by `endif` → decrement depth, check if 0
- Otherwise → advance

### 3.6 Malformed source handling

| Scenario | Scanner behavior |
|----------|-----------------|
| Unmatched `#endif` (depth 0) | Ignore. Let the regex-based extras handle it. |
| EOF inside open `#if` (depth > 0) | Emit the `PREPROC_BLOCK` token up to EOF. The grammar sees an incomplete token but no ERROR — the parse tree shows the partial block. |
| `#else`/`#elif` without `#if` (depth 0) | Ignore. Let the regex-based extras handle them as individual tokens. |
| Directive in unexpected position | Emit `PREPROC_BLOCK` anyway. The grammar decides where to consume it. If the grammar doesn't expect it (e.g., inside a class body at a position where `primary_expr` is not valid), the GLR parser will find a valid parse path or produce an ERROR. |

### 3.7 Interaction with the existing `preprocessor_directive` extras token

The scanner emits `PREPROC_BLOCK` for complete `#if`...`#endif` blocks. The
existing `preprocessor_directive` regex token in extras matches individual
directives. These must not conflict.

**Resolution**: The `PREPROC_BLOCK` token is declared in `externals`. The
existing `preprocessor_directive` token in extras is modified to NOT match
conditional directives (`#if`, `#ifdef`, `#ifndef`, `#else`, `#elif`,
`#elseif`, `#endif`). Only non-conditional directives remain in the extras
regex (`#define`, `#undef`, `#include`, `#pike`, `#charset`, `#pragma`,
`#require`, `#warning`, `#error`).

Conditional directives are handled exclusively by the external scanner:

- When the scanner sees `#if`/`#ifdef`/`#ifndef` at depth 0, it starts
  accumulating a `PREPROC_BLOCK` and emits it when the matching `#endif` is
  found.
- When the scanner sees a conditional directive but `PREPROC_BLOCK` is not a
  valid symbol in the current parse state, it returns false (does not emit),
  and the parser falls through to error recovery.

This avoids double-matching: conditional directives are either consumed by the
scanner (as part of a `PREPROC_BLOCK`) or they produce an ERROR (if the grammar
doesn't expect a `PREPROC_BLOCK` at that position). They are never consumed as
transparent extras.

## 4. State Specification

### 4.1 Scanner state

```c
typedef struct {
    uint8_t depth;  // Current #if/#endif nesting depth (0 = not inside a block)
} ScannerState;
```

Just one byte, following tree-sitter-al's pattern. The depth tracks how many
open `#if` directives have been seen without matching `#endif`.

**Why not track position of each open directive?** Not needed. The scanner
scans forward from the current lexer position each time `scan()` is called.
Tree-sitter handles backtracking and state serialization. The scanner only needs
to know if it's currently inside a conditional block.

### 4.2 Serialization/deserialization

```c
unsigned serialize(void *payload, char *buffer) {
    buffer[0] = (char)((ScannerState*)payload)->depth;
    return 1;
}

void deserialize(void *payload, const char *buffer, unsigned length) {
    ((ScannerState*)payload)->depth = (length > 0) ? (uint8_t)buffer[0] : 0;
}
```

1 byte. Called frequently (on every successful parse step). Minimal overhead.

### 4.3 Error recovery guard

When ALL external tokens are valid simultaneously, the parser is in error
recovery. The scanner returns false in this case:

```c
if (valid_symbols[PREPROC_BLOCK] && valid_symbols[HASH_STRING]) {
    // If all external tokens are valid, we're in error recovery.
    // Only trigger this if there are exactly 2 externals.
    // Return false to let the parser handle recovery.
}
```

With only 2 external tokens, this check is simple.

## 5. Grammar Interaction

### 5.1 External token declarations

```javascript
externals: $ => [
    $.preproc_block,
    $.hash_string,
],
```

Two external tokens. The scanner dispatches based on `valid_symbols`.

### 5.2 Grammar rule changes

**Additions:**

1. `primary_expr` gets a new alternative:
   ```javascript
   primary_expr: $ => choice(
     // ... existing alternatives ...
     $.preproc_block,
   ),
   ```

2. `string_literal` is modified to use the external scanner for hash-strings:
   ```javascript
   string_literal: _ => token(choice(
     seq('"', repeat(choice(/[^"\\]/, /\\./)), '"'),
     // REMOVED: seq('#"', repeat(choice(/[^"\\]/, /\\./)), '"')
     // REPLACED by external $.hash_string
   )),
   ```
   And a new rule:
   ```javascript
   hash_string: $ => seq('#', $.string_literal),
   ```
   Actually, since the scanner emits the complete `#"..."` token, the grammar
   just needs:
   ```javascript
   string_literal: _ => token(choice(
     seq('"', repeat(choice(/[^"\\]/, /\\./)), '"'),
   )),
   // hash_string is external — consumed from externals list
   ```
   Then in `primary_expr`:
   ```javascript
   primary_expr: $ => choice(
     // ... existing alternatives ...
     $.string_literal,
     $.hash_string,    // external scanner token
     $.preproc_block,  // external scanner token
   ),
   ```

3. `preprocessor_directive` in extras is modified to exclude conditional
   directives:
   ```javascript
   preprocessor_directive: _ => token(choice(
     // REMOVED: #if, #ifdef, #ifndef, #elif, #elseif, #elifdef, #elifndef, #else, #endif
     // KEPT: #define, #undef, #include, #pike, #charset, #pragma, #require, #warning, #error
     seq('#', /\s*/, 'define', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'undef', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'include', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'pike', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'charset', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'pragma', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'require', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'warning', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
     seq('#', /\s*/, 'error', /\s/, /(\\\n|\\[^\n]|[^\\\n])*/),
   )),
   ```

4. `_definition` gets `$.preproc_block` as an alternative (for top-level blocks):
   ```javascript
   _definition: $ => choice(
     // ... existing alternatives ...
     $.preproc_block,
   ),
   ```

5. `_stmt` gets `$.preproc_block` as an alternative (for blocks inside functions):
   ```javascript
   _stmt: $ => choice(
     // ... existing alternatives ...
     $.preproc_block,
   ),
   ```

6. Class body, enum body, and other block-contents also need `$.preproc_block`.

**Potential conflict**: Adding `$.preproc_block` to `primary_expr` means the
parser can accept it anywhere an expression is expected. But `$.preproc_block`
is only emitted by the scanner when it sees `#if` at the lexer position. This
means the parser will only try to match it when the scanner produces it. The
GLR parser may explore the `preproc_block` alternative speculatively, but since
the scanner only produces the token for actual `#if` directives, there should
be no false matches.

**Concern**: If the parser is in a state where `primary_expr` is valid and the
scanner sees `#if`, it will emit `PREPROC_BLOCK`. But what if `primary_expr` is
NOT valid at the current position? Then `PREPROC_BLOCK` is not in
`valid_symbols`, and the scanner returns false. The `#if` is not consumed, and
the parser produces an ERROR.

This is the same behavior as the current extras-based approach — if a
preprocessor directive appears in an unexpected position, it's an ERROR. The
difference is that now the directive is not silently consumed as an extra but
is either consumed as a `PREPROC_BLOCK` (in expression/statement/definition
positions) or produces an ERROR (in positions where no expression is expected).

### 5.3 Parse tree examples

**Example 1: PP splitting expression (KL-007a)**
```pike
// Source:
if (oob_sent >
#ifdef OOB_DEBUG
    5
#else
    511
#endif
    ) { ... }

// Parse tree:
(if_statement
  condition: (parenthesized_expr
    (binary_expr
      left: (postfix_expr (identifier_expr "oob_sent"))
      operator: ">"
      right: (preproc_block)))
  consequence: (block ...))
```

The `preproc_block` replaces what would be the right operand of `>`. The raw
text of the block (`#ifdef OOB_DEBUG\n    5\n#else\n    511\n#endif`) is the
node's text content.

**Example 2: PP splitting control flow (KL-007b, GTK pattern)**
```pike
// Source:
if (search(source, "Gnome") != -1)
#if constant(Gnome.init)
    Gnome.init("example", "1.0", ...);
#else
    return 1;
#endif
else
    GTK1.setup_gtk("make_gtkexample", 1);

// Parse tree with PREPROC_BLOCK:
// The PREPROC_BLOCK replaces the then-clause of the if:
(if_statement
  condition: (parenthesized_expr ...)
  consequence: (preproc_block)
  alternative: (if_statement  // dangling else
    consequence: (expression_statement ...)))
```

Wait — this won't work with the opaque block approach. The `PREPROC_BLOCK`
contains `#if constant(Gnome.init) Gnome.init(...); #else return 1; #endif`.
The grammar sees `if (cond) PREPROC_BLOCK else ...`. The `else` is NOT inside
the `PREPROC_BLOCK` — it's after it. So the parser should be able to attach the
`else` to the `if`.

**But**: the `PREPROC_BLOCK` would be placed in `primary_expr`, which is an
expression. The if-statement expects a consequence that is a statement or block.
An expression statement (`expression_statement`) wraps the `primary_expr`. So
the parser sees:

```
if (cond)
    [expression_statement containing PREPROC_BLOCK]
else
    [expression_statement]
```

This should work! The `PREPROC_BLOCK` is just an expression that happens to
contain preprocessor directives. The `if` statement's consequence is an
expression statement containing that expression. The `else` follows normally.

**Example 3: Variable initializer (KL-007a, Concurrent.pmod)**
```pike
// Source:
private string orig_backtrace =
#ifdef CONCURRENT_DEBUG
    sprintf("%s\n------\n", describe_backtrace(backtrace()))
#else
    ""
#endif
    ;

// Parse tree:
(declaration
  (variable_decl
    type: (type (basic_type "string"))
    name: (identifier "orig_backtrace")
    initializer: (preproc_block)))
```

The `PREPROC_BLOCK` is in `primary_expr`, which feeds into `_expr`, which feeds
into the variable initializer. Works.

**Example 4: Protected modifier block (KL-007b, tds.pike)**
```pike
// Source:
#if (__REAL_MAJOR__ > 7) || ((__REAL_MAJOR__ == 7) && (__REAL_MINOR__ >= 6))
protected {
#endif
  ... declarations ...
#if (__REAL_MAJOR__ > 7) || ((__REAL_MAJOR__ == 7) && (__REAL_MINOR__ >= 6))
};
#endif

// Parse tree (top level):
(preproc_block)      // #if ... protected { #endif
(declaration ...)    // ... declarations inside the protected block ...
(preproc_block)      // #if ... }; #endif
```

Hmm — this won't work correctly. The `protected {` is inside the first
`PREPROC_BLOCK`, and `};` is inside the second. The declarations between them
are not actually inside the `protected { }` block — they're parsed as normal
top-level definitions. The `protected` modifier is lost.

This is an inherent limitation of the opaque-block approach: when `#if`/`#endif`
wraps a structural boundary (opening `{` or closing `}`), the scanner cannot
pair the braces across the block boundary. The declarations would parse without
the `protected` modifier.

**Mitigation**: The tds.pike case (#3 in KL-007b) is the only file with this
pattern in the current error set. The declarations parse correctly — they just
lack the `protected` modifier in the parse tree. For downstream consumers
(highlighting, navigation), this is acceptable. The file still parses without
ERROR nodes.

Wait — let me reconsider. Currently, tds.pike has ERROR nodes at lines 187 and
192 because `protected object utf16enc = ...` fails to parse inside the
unrecognized `protected {` block. With the scanner, would these still error?

The scanner would produce two `PREPROC_BLOCK` tokens:
1. `#if ... protected { #endif` — consumed as a statement/definition
2. `#if ... }; #endif` — consumed as a statement/definition

Everything between them is parsed normally. The declarations like
`protected object utf16enc = Charset.encoder("UTF16LE");` would parse correctly
as normal (non-protected) variable declarations. The explicit `protected` keyword
on each declaration would make them protected regardless.

So the scanner DOES fix this case — not by understanding the modifier block, but
by making the `#if`/`#endif` that wraps `protected {` and `}` into opaque blocks
that the parser skips over. The actual declarations inside parse normally.

## 6. Predicted Impact

### 6.1 Files expected to move from error to clean

**KL-007a (5 files) — all fixable by scanner:**
1. `Audio/Codec.pmod` — `#if` splits `==` expression
2. `Concurrent.pmod` — `#ifdef` splits variable initializer
3. `Parser/LR/GrammarParser.pmod` — `#ifdef` splits function argument
4. `Protocols/LysKOM/Raw.pike` — `#if` splits `||` expression
5. `src/_Stdio/socktest.pike` — `#ifdef` splits `>` expression

**KL-007b (5 files) — 5 fixable:**
1. `GTK1/make_example_image.pike` — `#if` splits if-then/else
2. `GTK2/make_example_image.pike` — same pattern
3. `Sql/tds.pike` — `#if` emits `protected { }` modifier block
4. `SSL/sslfile.pike` — compound macro + PP patterns (partially)
5. `Protocols/LDAP/client.pike` — IF_ELSE_PAGED_SEARCH macro (partially)

**KL-007e (2 files) — fixable by hash-string scanner:**
1. `Tools/Standalone/precompile.pike` — hash-string with backslash-newline
2. `bin/install.pike` — hash-strings with multi-line content

**Not fixable by scanner (4 files):**
1. `Debug/Subject.pike` — PROXY backtick operator (KL-007c)
2. `Standards/URI.pike` — P(X) mapping pair (KL-007d)
3. `Stdio/Terminfo.pmod` — bare MUTEX (KL-007f)
4. `7.8/Standards/ASN1/Types.pmod` — DEC_COMB_MARK GR("") adjacent macro (KL-007c)

### 6.2 Predicted parse rate

| Scenario | Clean files | Rate |
|----------|-------------|------|
| Current (Round 15, grammar-only) | 1066/1082 | 98.5% |
| After scanner (optimistic) | 1075/1082 | 99.4% |
| After scanner (conservative) | 1072/1082 | 99.1% |

**Optimistic prediction (99.4%)**: All 5 KL-007a files + all 5 KL-007b files +
both KL-007e files are fixed. That's 12 files minus 3 that overlap (some
counted in both KL-007a and KL-007b in the current set) = 9 net new clean files.
1066 + 9 = 1075.

**Conservative prediction (99.1%)**: KL-007b compound cases (sslfile.pike,
client.pike) are only partially fixed. Some errors remain from macro-argument
patterns that the scanner can't address. That's 6 net new clean files.
1066 + 6 = 1072.

**Remaining errors (7-10 files)**: KL-007c (PROXY backtick, ASN1/Types.pmod),
KL-007d (P(X) mapping pair), KL-007f (bare MUTEX), and partially-fixed
compound cases.

### 6.3 This supports the scope expansion

If the scanner hits 99.1%+ (conservative), it validates the architectural
investment. The gap from 98.5% to 99.1% is 6+ files — more than the grammar
fixes achieved (3 files). And it opens the door to 99.4%+ with further
refinements.

If the scanner falls below 99.0%, the post-mortem should examine why and
whether the opaque-block approach needs to be revised or abandoned.

## 7. Test Plan

### 7.1 Corpus tests (minimum required)

```
================================================================================
Preproc block - simple if/endif in expression
================================================================================
int x = VALUE
#if constant(foo)
+ 1
#else
+ 2
#endif
;

--------------------------------------------------------------------------------

(program
  (declaration
    (variable_decl
      type: (type (basic_type))
      name: (identifier)
      initializer: (binary_expr
        left: (postfix_expr (primary_expr (identifier_expr)))
        operator: "+"
        right: (preproc_block)))))

================================================================================
Preproc block - nested if/endif
================================================================================
int x =
#if constant(a)
  1
  #if constant(b)
    + 2
  #else
    + 3
  #endif
#else
  4
#endif
;

--------------------------------------------------------------------------------

(program
  (declaration
    (variable_decl
      type: (type (basic_type))
      name: (identifier)
      initializer: (preproc_block))))

================================================================================
Preproc block - splits if/else
================================================================================
if (cond)
#if constant(x)
  do_x();
#else
  do_other();
#endif
else
  do_default();

--------------------------------------------------------------------------------

(program
  (expression_statement
    (if_statement
      condition: (parenthesized_expr
        (postfix_expr (primary_expr (identifier_expr))))
      consequence: (expression_statement
        (preproc_block))
      alternative: (if_statement
        consequence: (expression_statement
          (postfix_expr ...))))))

================================================================================
Hash string - multi-line
================================================================================
string s = #"
hello
world
";

--------------------------------------------------------------------------------

(program
  (declaration
    (variable_decl
      type: (type (basic_type))
      name: (identifier)
      initializer: (hash_string))))

================================================================================
Preproc block - directive inside string (should NOT pair)
================================================================================
string s = "#if this is not a directive
" + VALUE;

--------------------------------------------------------------------------------

(program
  (declaration
    (variable_decl
      type: (type (basic_type))
      name: (identifier)
      initializer: (binary_expr
        left: (string_literal)
        operator: "+"
        right: (postfix_expr (primary_expr (identifier_expr)))))))

================================================================================
Preproc block - EOF inside open #if
================================================================================
int x = VALUE
#if constant(foo)
  + 1

--------------------------------------------------------------------------------

(program
  (declaration
    (variable_decl
      type: (type (basic_type))
      name: (identifier)
      initializer: (binary_expr
        left: (postfix_expr (primary_expr (identifier_expr)))
        operator: "+"
        right: (preproc_block)))))
```

### 7.2 Distribution file validation

After implementation, run the full distribution parse and compare against the
Round 15 baseline (1066/1082). Expected:

- All 5 KL-007a files move to clean
- At least 3 of 5 KL-007b files move to clean (GTK1, GTK2, tds.pike definite;
  sslfile.pike and client.pike uncertain)
- Both KL-007e files move to clean
- No regressions: files that were clean in Round 15 must remain clean

### 7.3 Regression test

Run all 204 corpus tests. They must all pass. Any regression is a blocker.

### 7.4 Specific edge cases to test

1. `#if` inside a block comment: `/* #if should not pair */` — no PREPROC_BLOCK
2. `#if` inside a line comment: `// #if should not pair` — no PREPROC_BLOCK
3. `#if` inside a string: `"#if should not pair"` — no PREPROC_BLOCK
4. `#if` inside a hash-string: `#"#if should not pair"` — no PREPROC_BLOCK
5. Nested `#if`: 3 levels deep, all close correctly
6. `#elif` between `#if` and `#endif`: included in the opaque block
7. Multiple `#else`: malformed, scanner includes both in the block
8. `#if` at top level without expression context: consumed as definition
9. Empty `#if`/`#endif` block: `#if constant(x)\n#endif` — empty PREPROC_BLOCK
10. `#` followed by whitespace then directive keyword: `# if constant(x)` —
    Pike allows whitespace between `#` and the directive keyword

## 8. Implementation Notes for Round 16

### 8.1 File structure

```
src/scanner.c        — The external scanner implementation
src/tree_sitter/     — Existing tree-sitter headers (alloc.h, array.h, parser.h)
```

### 8.2 Scanner entry points (required by tree-sitter)

```c
void *tree_sitter_pike_external_scanner_create(void);
void tree_sitter_pike_external_scanner_destroy(void *payload);
bool tree_sitter_pike_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols);
unsigned tree_sitter_pike_external_scanner_serialize(void *payload, char *buffer);
void tree_sitter_pike_external_scanner_deserialize(void *payload, const char *buffer, unsigned length);
```

### 8.3 Key implementation considerations

1. **Use tree-sitter allocation API**: `ts_calloc`/`ts_free` from
   `tree_sitter/alloc.h`, not stdlib `calloc`/`free`.
2. **Whitespace handling**: The scanner must skip whitespace to find the `#`.
   Use `lexer->advance(lexer, true)` for skip-whitespace advance.
3. **mark_end for PREPROC_BLOCK**: Call `lexer->mark_end(lexer)` when the
   matching `#endif` is found. The token covers everything from the opening
   `#if` to the end of the `#endif` line.
4. **mark_end for HASH_STRING**: Call `lexer->mark_end(lexer)` when the closing
   `"` is found. The token covers `#"..."`.
5. **Line continuation**: Handle `\` followed by newline as line continuation
   inside preprocessor directives. The `#if` condition can span multiple lines
   via `\` continuation.
6. **Pike-specific: `#` with whitespace**: Pike allows `# if`, `# ifdef`, etc.
   The scanner must handle optional whitespace between `#` and the directive
   keyword.

### 8.4 Build changes

The `tree-sitter.json` or `package.json` must be updated to compile `src/scanner.c`
alongside `src/parser.c`. For tree-sitter CLI, this happens automatically if
`src/scanner.c` exists.

## 9. Open Questions

1. **Should `PREPROC_BLOCK` also consume standalone `#else` and `#elif`?**
   Currently, the design has `PREPROC_ELSE` and `PREPROC_ELIF` tokens for
   standalone directives. But if conditional directives are removed from extras,
   standalone `#else`/`#elif` (not inside a `PREPROC_BLOCK`) would not be
   consumed at all. The scanner could either:
   - (a) Emit them as separate tokens, and the grammar adds them as
     statement/definition alternatives.
   - (b) Ignore them, and they become ERROR nodes.
   - (c) Fall through to a fallback mechanism.

   **Resolution**: Option (b) is simplest. In practice, standalone `#else` and
   `#elif` (not between `#if` and `#endif`) don't occur in the Pike
   distribution. If they did, it would be malformed code. Let them be ERRORs.

2. **Should the scanner handle `#if` at the top level vs. inside expressions
   differently?** No. The scanner emits the same `PREPROC_BLOCK` token
   regardless of position. The grammar decides where to consume it.

3. **Should `PREPROC_BLOCK` contents be accessible to downstream consumers?**
   The opaque block's text is available as the node's text content (via
   `ts_node_start_byte`/`ts_node_end_byte`). Downstream consumers can extract
   the raw text if needed. The scanner does not need to provide structured
   access.

4. **What about `#if 0 ... #endif` dead code blocks?** The scanner treats them
   the same as any other `PREPROC_BLOCK`. The content is opaque. This is
   correct — the scanner does not evaluate conditions.

5. **What about `#line` directives?** Not present in the Pike distribution's
   Pike source files. Not handled by the scanner.

## 10. Post-Design Analysis (Round 16)

### PREPROC_BLOCK approach is not viable

The PREPROC_BLOCK token was implemented and tested. It was found to be
incompatible with the transparent extras approach for conditional directives.

**The problem**: 224 of 1082 distribution files contain conditional directives
(`#if`, `#ifdef`, `#ifndef`). Making these opaque blocks would:

1. Remove all structured parse tree content inside `#ifdef` blocks — declarations,
   expressions, statements would become opaque text. This is a severe tree-fidelity
   regression for downstream consumers (highlighting, navigation, indentation).
2. Break the `string_concat` juxtaposition rule for hash-strings adjacent to
   regular strings, causing regressions on previously-clean files.

**Why it can't coexist with transparent extras**: Tree-sitter's external scanner
fires BEFORE the default lexer. If `PREPROC_BLOCK` is in `valid_symbols` (which it
is whenever `primary_expr` is expected — essentially all non-trivial parse states),
the scanner consumes the entire `#if...#endif` block as opaque. The transparent
extras never get a chance to handle it.

**Attempted mitigation**: Only putting `PREPROC_BLOCK` in specific rules
(`primary_expr` but not `_definition`/`_stmt`) doesn't help because
`primary_expr` is reachable from `_stmt` (via `expression_statement`), so the
scanner still fires at statement boundaries.

**Decision**: PREPROC_BLOCK is dropped. The scanner only implements HASH_STRING.

### Revised scanner scope

| Token | Status | Impact |
|-------|--------|--------|
| `PREPROC_BLOCK` | Dropped | Not viable without regressing 224 files |
| `HASH_STRING` | Implemented | Fixes 1 file (precompile.pike), no regressions |

### What this means for KL-007

- KL-007a (5 files, PP splitting expressions): Not fixable by scanner.
  Would require PREPROC_BLOCK or equivalent opaque approach.
- KL-007b (5 files, PP splitting control flow): Same as KL-007a.
- KL-007c (3 remaining files, macro arguments): Grammar-only, not scanner-addressable.
- KL-007d (1 file, P(X) mapping pair): Not scanner-addressable.
- KL-007e (1 file fixed, 1 misclassified): precompile.pike fixed by HASH_STRING.
  bin/install.pike's root error is RELAY() macro arguments, not hash-strings.
- KL-007f (1 file, bare MUTEX): Not scanner-addressable.

### Result

1067/1082 (98.71%) clean, up from 1066/1082 (98.52%).
+1 file fixed, 0 regressions. 208/208 corpus tests pass.