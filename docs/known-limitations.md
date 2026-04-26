# Known Limitations

Each item has a "Last validated" field indicating the most recent round where
the limitation was confirmed to still hold. Items that have been on the list
for 2+ rounds without progress must include a written reason or be escalated.

## Active Limitations

### KL-001: function(:void) zero-arg type produces zero-width missing identifier
- **Description**: `function(:void)` parses with GLR error recovery creating a
  zero-width missing identifier node in the parameter list.
- **Root cause**: Cannot be fixed without an external scanner to disambiguate
  the empty position before `:`.
- **Impact**: Cosmetic only; the parse tree is correct except for the spurious
  missing node.
- **Last validated**: Round 8
- **Rounds active**: 3+

### KL-002: `->name=` backtick setter form requires external scanner
- **Description**: The token `` `->name= `` is split by the lexer into
  `` `->name `` and `=` as separate tokens.
- **Root cause**: The backtick_identifier token regex can capture `->name` but
  the `=` is always lexed separately. Fixing requires an external scanner.
- **Impact**: Setter forms like `` `foo= `` work but `` `->name= `` does not
  parse as a single token.
- **Last validated**: Round 8
- **Rounds active**: 3+

### KL-003: version_prefix (7.8::foo) requires external scanner
- **Description**: The `major.minor::identifier` syntax (e.g., `7.8::foo`)
  cannot be parsed because `7.8` is lexed as a float token, not as a version
  prefix.
- **Root cause**: The lexer sees `7.8` as a single float literal. An external
  scanner would need to recognize the `::` following a float-like token.
- **Impact**: Code using version prefixes fails to parse.
- **Last validated**: Round 8
- **Rounds active**: 3+

### KL-004: Top-level break/continue without enclosing loop
- **Description**: `break` and `continue` parse at the top level of a block
  without checking for an enclosing loop/switch. Pike would reject these.
- **Root cause**: Tree-sitter grammars cannot enforce context-sensitive
  constraints like "must be inside a loop." This is a semantic check, not
  a syntactic one.
- **Impact**: Accepts invalid Pike code. Low severity since static analysis
  tools catch this.
- **Last validated**: Round 8
- **Rounds active**: 3+

### KL-005: class { }() anonymous class instantiation as expression
- **Description**: `class { int x; }()` — creating an anonymous class and
  immediately instantiating it — fails to parse. The `class` keyword is only
  recognized in declaration position, not expression position.
- **Root cause**: yacc has `implicit_modifiers class` as an `expr4` (primary
  expression) alternative. Our grammar only has `class_decl` in `declaration`
  and `local_declaration` contexts, not in `primary_expr`.
- **Impact**: Anonymous class instantiation in variable initializers and
  expression positions fails. Named class declarations work fine.
- **Last validated**: Round 10
- **Rounds active**: 1
