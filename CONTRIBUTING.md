# Contributing to tree-sitter-pike

Thank you for your interest in contributing to tree-sitter-pike!

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [tree-sitter-cli](https://tree-sitter.github.io/tree-sitter/) (installed via `bunx`)

### Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Generate the parser: `bash scripts/generate.sh`
4. Run tests: `bunx tree-sitter test`

## Branch Naming

Use conventional branch names:

```
feat/grammar-feature-name
fix/scanner-bug-fix
docs/update-readme
chore/update-dependencies
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scanner): add support for hash-string literals
fix(grammar): correct operator precedence for ternary expressions
docs: update README with new examples
```

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

## Changelog

All notable changes must be documented in [CHANGELOG.md](CHANGELOG.md) under the `[Unreleased]` section.

Categories:
- **Added** — New features
- **Changed** — Changes to existing functionality
- **Deprecated** — Soon-to-be removed features
- **Removed** — Removed features
- **Fixed** — Bug fixes
- **Security** — Vulnerability fixes

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Add corpus tests for new grammar features
4. Run `bunx tree-sitter test` to verify
5. Update `CHANGELOG.md` if applicable
6. Submit a pull request with a clear description

### PR Requirements

- [ ] Code follows existing style (2-space indentation)
- [ ] Tests pass: `bunx tree-sitter test`
- [ ] Examples parse correctly: `bunx tree-sitter parse examples/*.pike`
- [ ] CHANGELOG.md updated for user-facing changes
- [ ] New grammar features have corpus test coverage

## Grammar Development

When modifying the grammar:

1. **Read the reference grammar**: The authoritative Pike grammar is at `pike-ai/Pike/src/language.yacc`
2. **Update grammar.ts**: This is the source of truth
3. **Regenerate**: Run `bash scripts/generate.sh` after changes
4. **Test**: Add corpus tests in `test/corpus/`
5. **Parse examples**: Ensure real Pike files parse correctly

## External Scanner

Changes to `src/scanner.c` require:

1. C compiler knowledge
2. Understanding of tree-sitter's external scanner API
3. Testing with hash-string literals and preprocessor directives

## Questions?

Open an issue for discussion before making significant changes.