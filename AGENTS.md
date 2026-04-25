# AGENTS.md

This is a tree-sitter grammar for the Pike programming language.

## Source grammar

`grammar.ts` — TypeScript strict, the authoritative source. Compiled to `grammar.js` via:

```
bun build grammar.ts --outfile grammar.js --target node --format esm
```

Do **not** edit `grammar.js` directly; it is regenerated from `grammar.ts`.

## Build

```
bun build grammar.ts --outfile grammar.js --target node --format esm && bunx tree-sitter generate
```

Or use the helper: `bash scripts/generate.sh`

## Test

```
bunx tree-sitter test
```

## Parse

```
bunx tree-sitter parse <file>
```

## Reference grammar

The authoritative Pike grammar is at `pike-ai/Pike/src/language.yacc`. Use it as the ground truth for any grammar decisions.

## Node naming

Named nodes use lowercase snake_case: `identifier`, `type`, `function_decl`, `class_decl`, `lambda_expr`, etc. Naming follows ast-grep conventions for consistent pattern matching.
