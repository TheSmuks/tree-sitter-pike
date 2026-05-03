# Architecture

## Overview

tree-sitter-pike is a tree-sitter grammar for the Pike programming language (version 8.0.1116). It provides syntax highlighting, code folding, and semantic analysis capabilities for Pike source code.

## Components

### Grammar Definition

```
grammar.ts → grammar.js → src/parser.c
```

1. **`grammar.ts`** (authoritative)
   - Written in TypeScript strict mode
   - Defines all grammar rules using tree-sitter's DSL
   - Compiled to `grammar.js` via `bun build`

2. **`grammar.js`** (generated)
   - ESM module output from TypeScript compilation
   - Regenerated whenever grammar.ts changes

3. **`src/parser.c`** (generated)
   - C parser output from `tree-sitter generate`
   - Used by tree-sitter bindings for various languages
   - DO NOT edit directly

### External Scanner

Located in `src/scanner.c`, the external scanner handles Pike-specific tokens that are difficult or impossible to express in the tree-sitter grammar DSL:

- **Hash-string literals**: Pike uses `#string"..."` syntax for raw strings
- **Preprocessor directives**: `#if`, `#else`, `#elif`, `#endif`, etc.

The scanner integrates with tree-sitter's lexer to handle these cases before the main grammar rules are applied.

### Test Corpus

Located in `test/corpus/`, corpus tests define expected parse trees for Pike code snippets:

- Each test case specifies input source code
- Expected AST structure is validated
- Tests are run via `bunx tree-sitter test`
- 210+ test cases cover Pike syntax comprehensively

### ast-grep Integration

The project uses ast-grep for structural code analysis:

- **`sgconfig.yml`**: ast-grep configuration
- **`queries/`**: tree-sitter queries for syntax highlighting, etc.
- **`rules/`**: ast-grep rules for code pattern matching

## Build Pipeline

1. **TypeScript compilation**: `bun build grammar.ts --outfile grammar.js --target node --format esm`
2. **Parser generation**: `bunx tree-sitter generate`
3. **Testing**: `bunx tree-sitter test`
4. **Example parsing**: `bunx tree-sitter parse examples/*.pike`

## Reference Grammar

The authoritative Pike grammar is maintained in [pike-ai/Pike](https://github.com/pike-ai/Pike) at `src/language.yacc`. When implementing new grammar features:

1. Reference the yacc grammar for expected behavior
2. Add corpus tests covering the feature
3. Verify against real Pike source code examples

## Design Decisions

See `docs/decisions/` for Architecture Decision Records (ADRs).

Key decisions:
- **External scanner for hash-strings**: Necessary because `#` is a valid identifier character in Pike, making it impossible to lex greedily in the grammar
- **TypeScript strict mode**: Catches type errors early during grammar development
- **Separate scanner.c**: Keeps C code isolated from TypeScript grammar for maintainability