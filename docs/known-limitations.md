# Known Limitations

Each item has a "Last validated" field indicating the most recent round where
the limitation was confirmed to still hold. Items that have been on the list
for 2+ rounds without progress must include a written reason or be escalated.

## Active Limitations

### KL-003: version_prefix (7.8::foo) requires external scanner
- **Description**: The `major.minor::identifier` syntax (e.g., `7.8::foo`,
  `inherit 7.0::Stdio;`) cannot be parsed because `7.8` is lexed as a float
  token, not as a version prefix.
- **Ambiguous token sequence**: `7.8::` — the lexer encounters `7.8` and must
  decide between two token types:
  1. `float_literal` (regex: `/[0-9]+\.[0-9]+/`)
  2. `version_prefix` (regex: `/[0-9]+\.[0-9]+/`)
  Both rules match the same character sequence `7.8` with identical length.
- **Competing parses**:
  - Parse A (correct): `(version_prefix) (::) (identifier)` → scope resolution
  - Parse B (actual): `(float_literal) (::) (identifier)` → ERROR at `::`
- **Why precedence cannot resolve it**: Both alternatives are `token()` rules
  with identical regex patterns. Tree-sitter's longest-match rule produces a
  tie. The lexer commits to the token before the parser can see `::`.
- **Why rule restructuring cannot resolve it**: `version_prefix` and
  `float_literal` are both atomic `token()` rules. Moving version detection
  into the grammar (e.g., making `7.8::` a single token) would prevent `7.8`
  from being used as a float in other contexts.
- **Specific lookahead requirement**: The lexer must scan past `7.8` and check
  whether `::` follows (with optional whitespace). If `::` follows, emit
  `version_prefix`; otherwise emit `float_literal`. This is a two-token
  lookahead that tree-sitter's default lexer architecture does not support.
- **Pike's lexer behavior** (lexer.h L990-1030): Pike's `read_float` path
  explicitly checks for `::` after the fractional digits using `GOBBLE` and
  conditional logic. It emits `TOK_VERSION` or `TOK_FLOAT` based on this
  lookahead. This is context-sensitive lexing.
- **Impact**: ALL version-prefixed identifiers fail. Affects `7.8::Stdio`,
  `inherit 7.0::Stdio;`, and any `major.minor::identifier` construct.
- **Last validated**: Round 10
- **Rounds active**: 3+

### KL-004: Top-level break/continue without enclosing loop
- **Description**: `break` and `continue` parse at the top level of a block
  without checking for an enclosing loop/switch. Pike would reject these.
- **Root cause**: Tree-sitter grammars cannot enforce context-sensitive
  constraints like "must be inside a loop." This is a semantic check, not
  a syntactic one.
- **Impact**: Accepts invalid Pike code. Low severity since static analysis
  tools catch this.
- **Last validated**: Round 10
- **Rounds active**: 3+

## Resolved Limitations

### KL-001: function(:void) zero-arg type — RESOLVED in Round 10
- **Original claim**: `function(:void)` produces zero-width missing identifier.
- **Resolution**: The `_function_type` rule with `optional(trailingCommaSep1($.type))`
  correctly handles the zero-argument case. When the optional is empty, the parser
  proceeds directly to `:`. GLR handles this without error recovery. The parse tree
  is correct. The original claim was based on an earlier grammar version.
- **Removed**: Round 10

### KL-002: `foo=` backtick setter form — RESOLVED in Round 10
- **Original claim**: `` `foo= `` setter form requires external scanner.
- **Resolution**: The fix was a grammar change, not an external scanner. Added
  `=?` to the backtick identifier regex: `/`[a-zA-Z_][a-zA-Z0-9_]*=?/`. This
  optionally consumes the trailing `=` as part of the identifier token, matching
  Pike's lexer behavior where `GOBBLE('=')` appends `=` to identifier names.
  The `` `->name= `` form was already working via the `seq('`', '->', regex, optional('='))`
  alternative; the same `optional('=')` pattern was simply missing from the
  plain identifier alternative.
- **Removed**: Round 10

### KL-005: class { }() as expression — REMOVED in Round 10
- **Original claim**: Anonymous class instantiation fails because `class` keyword
  is not in `primary_expr`.
- **Resolution**: False positive. The `anon_class` rule IS in `primary_expr` (line
  264 of grammar.ts) and handles `class { body }()` correctly — the postfix `()`
  is a call expression on the class value. The original test case
  `class { int x; } o = class { int x; }()` was invalid Pike: `class { } o`
  tries to use an anonymous class as a type name in a declaration, which Pike
  itself rejects (`syntax error, unexpected TOK_IDENTIFIER`).
- **Removed**: Round 10
