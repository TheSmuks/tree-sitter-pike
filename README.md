# tree-sitter-pike

Pike grammar for [tree-sitter](https://tree-sitter.github.io/), covering [Pike 8.0.1116](https://pike.lysator.liu.se/).

Based on the official Pike yacc grammar (`pike-ai/Pike/src/language.yacc`).

Compatible with [ast-grep](https://ast-grep.github.io/) via custom language registration.

## Status

| Metric | Value |
|--------|-------|
| Distribution parse rate | **1071/1082 (99.0%)** |
| Corpus tests | **210/210 (100%)** |
| Grammar rule coverage | **80/80 named rules** |
| Branch coverage | **166/166 choice() alternatives** |
| Parse correctness | 100 sampled files, 0 structural errors |

The 11 unparseable files (0.9%) are documented in [docs/ceiling-decision.md](docs/ceiling-decision.md)
with root cause analysis and resolution options. Four architectural limitations
prevent these files from parsing:

1. **PP-split expressions** (7 files): `#if`/`#ifdef` blocks inside sub-expressions
2. **GLR state machine structural change** (1 file): modifier+function_decl in `_stmt`
3. **RELAY juxtaposition** (1 file): adjacent macro invocations without operators
4. **if-statement as macro argument** (2 files): bare `if/else` in macro arguments

See [docs/known-limitations.md](docs/known-limitations.md) for the full catalog.

## Installation

```bash
bun install
```

## Usage

### Generate parser

```bash
bun run generate
```

### Run tests

```bash
bun run test
```

### Parse a file

```bash
bunx tree-sitter parse path/to/file.pike
```

### Run distribution parse

```bash
python3 /tmp/dist_parse.py
```

## Development

The source grammar is `grammar.ts` (TypeScript strict). It is transpiled to `grammar.js` before tree-sitter code generation.

| Command | Description |
|---|---|
| `bun run check` | Type-check grammar.ts |
| `bun run generate` | Transpile TS → JS and generate parser |
| `bun run test` | Run tree-sitter corpus tests (210 tests) |

### Architecture

- **grammar.ts**: Grammar definition using tree-sitter DSL
- **src/scanner.c**: External scanner for hash-string literals (`#"..."`)
- **test/corpus/**: 7 test files covering declarations, expressions, statements, types, literals, Pike-specific constructs, and extras (comments/preprocessor/macros)
- **docs/**: Design documentation, convergence history, and known limitations

### Node types

The grammar produces 80 named node types including:
- **Declarations**: `function_decl`, `variable_decl`, `class_decl`, `enum_decl`, `constant_decl`, `typedef_decl`, `import_decl`, `inherit_decl`
- **Statements**: `if_statement`, `while_statement`, `for_statement`, `foreach_statement`, `switch_statement`, `return_statement`, `expression_statement`, `macro_statement`
- **Expressions**: Full precedence chain (`comma_expr` through `primary_expr`), `lambda_expr`, `catch_expr`, `gauge_expr`, `sscanf_expr`, `scope_expr`, `cast_expr`
- **Types**: `type`, `basic_type`, `id_type`, with parameterized containers, union types, function types, int ranges
- **Macros**: `macro_invocation`, `macro_invocation_stmt`, `macro_argument_list`, `macro_statement`
- **Modifiers**: `modifier` (private, protected, public, static, final, deprecated, etc.)

## License

MIT
