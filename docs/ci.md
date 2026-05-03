# CI/CD Documentation

This document describes the continuous integration workflows for tree-sitter-pike.

## Workflows

### ci.yml — Primary Build Pipeline

Runs on every push to `main` and all pull requests.

**Steps:**
1. Checkout code
2. Install Bun
3. `bun install` — Install dependencies
4. `bun build grammar.ts` — Compile TypeScript grammar
5. `bunx tree-sitter generate` — Generate parser
6. `bunx tree-sitter test` — Run corpus tests
7. `bunx tree-sitter parse examples/*.pike` — Parse example files

### commit-lint.yml — Commit Message Validation

Runs on every push and pull request.

Validates commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
```
<type>(<scope>): <description>

Types: feat, fix, docs, chore, refactor, test
Scope: Optional (e.g., grammar, scanner, test)
```

### changelog-check.yml — Changelog Validation

Runs on pull requests to `main`.

Ensures `CHANGELOG.md` is updated when changes affect:
- Source code files
- Grammar rules
- External scanner

Skips for: docs-only, chore, version bump commits.

### blob-size-policy.yml — File Size Monitoring

Runs on every push.

Warns when files larger than 100KB are added to the repository. Large files may indicate:
- Accidentally committed binaries
- Generated files that should be in .gitignore
- Build artifacts

### branch-cleanup.yml — Stale Branch Cleanup

Runs on pushes to `main`.

Automatically deletes branches that have been merged into `main`.

## Local Testing

Run the CI steps locally before pushing:

```bash
# Install dependencies
bun install

# Build grammar
bun build grammar.ts --outfile grammar.js --target node --format esm
bunx tree-sitter generate

# Run tests
bunx tree-sitter test

# Parse examples
bunx tree-sitter parse examples/*.pike
```

## Dependencies

- [Bun](https://bun.sh/) — JavaScript runtime and package manager
- [tree-sitter-cli](https://tree-sitter.github.io/tree-sitter/) — Grammar development tools