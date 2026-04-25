# tree-sitter-pike

Pike grammar for [tree-sitter](https://tree-sitter.github.io/), covering [Pike 8.0.1116](https://pike.lysator.liu.se/).

Based on the official Pike yacc grammar (`pike-ai/Pike/src/language.yacc`).

Compatible with [ast-grep](https://ast-grep.github.io/) via custom language registration.

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

## Development

The source grammar is `grammar.ts` (TypeScript strict). It is transpiled to `grammar.js` before tree-sitter code generation.

| Command | Description |
|---|---|
| `bun run check` | Type-check grammar.ts |
| `bun run generate` | Transpile TS → JS and generate parser |
| `bun run test` | Run tree-sitter corpus tests |

## License

MIT
