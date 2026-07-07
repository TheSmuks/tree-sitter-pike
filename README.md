# tree-sitter-pike

Pike grammar for [tree-sitter](https://tree-sitter.github.io/), covering [Pike 8.0.1116](https://pike.lysator.liu.se/).

Based on the official Pike yacc grammar (`pike-ai/Pike/src/language.yacc`).

Compatible with [ast-grep](https://ast-grep.github.io/) via custom language registration.

## Status

| Metric | Value |
|--------|-------|
| Installed-distribution parse rate | **624/624 (100%)** |
| Corpus tests | **224/224 (100%)** |

The installed-distribution rate is measured by parsing every `.pike`/`.pmod`
file under the Pike 8.0.1116 module/include paths reported by `pike --show-paths`.

Three architectural limitations previously documented here have been resolved:

1. **PP-split expressions** — `#if`/`#else`/`#endif` splitting a single
   expression now parse as a `preproc_conditional_expr` node.
2. **modifier + function declaration in a block** — `local_function_decl`
   now accepts leading modifiers (e.g. inside a `protected { … }` block).
3. **statements as macro arguments** — control-flow macros such as
   `RUN_MAYBE_BLOCKING(cond, 0, 1, MSG("…"); return 0;)` and
   `IF_ELSE_PAGED_SEARCH(if (…) { … },)` now parse via `macro_argument_stmts`.

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


### ast-grep

Build the shared library, then use ast-grep for structural search and rewrite:

```bash
bunx tree-sitter build --output pike.so

# Pattern search — all constructs work: declarations, functions, classes,
# if/while/for/foreach/switch statements, returns, etc.
bunx ast-grep run -c sgconfig.yml -l pike -p 'void $FN($$$ARGS) { $$$BODY }' examples/
bunx ast-grep run -c sgconfig.yml -l pike -p 'if ($COND) { $$$BODY }' examples/
bunx ast-grep run -c sgconfig.yml -l pike -p 'foreach($ITER; $LVAL) { $$$BODY }' examples/
bunx ast-grep run -c sgconfig.yml -l pike -p 'return $VAL;' examples/

# Rule-based scan with YAML rules
bunx ast-grep scan -c sgconfig.yml examples/

# Rewrite preview
bunx ast-grep run -c sgconfig.yml -l pike -p 'inherit $X;' --rewrite 'inherit $X;  // kept' examples/adt_struct.pike
```

Pattern search (`-p`) works for all Pike constructs including statement-level
patterns (if, foreach, while, return, etc.). Rule-based scanning (`scan`)
with YAML rules supports additional matching modes like `kind:`, `regex:`, and
`not:`. See `rules/example.yml` for a sample rule.
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
