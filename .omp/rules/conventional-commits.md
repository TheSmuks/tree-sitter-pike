# Rule: Conventional Commits

## Description

All commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) format.

## Format

```
<type>(<scope>): <description>

Types: feat | fix | docs | style | refactor | test | chore | perf | ci | build

Scope: Optional but recommended
  - grammar (grammar.ts changes)
  - scanner (src/scanner.c changes)
  - test (test corpus changes)
  - ci (CI/CD changes)
  - docs (documentation changes)
```

## Examples

### Valid Commits

```
feat(grammar): add support for Pike's splice operator
fix(scanner): correct hash-string literal parsing
docs: update README with new examples
refactor(grammar): reorganize expression precedence
test: add corpus tests for class inheritance
chore: update dependencies
```

### Invalid Commits

```
Update grammar.ts                  # Missing type
Fixed the scanner bug              # Wrong tense, missing type
WIP                                # Non-descriptive
feat: Added new feature            # Past tense
```

## Type Definitions

| Type | Description |
|------|-------------|
| feat | New feature |
| fix | Bug fix |
| docs | Documentation only |
| style | Formatting (non-functional) |
| refactor | Code restructuring |
| test | Adding or updating tests |
| chore | Maintenance tasks |
| perf | Performance improvements |
| ci | CI/CD changes |
| build | Build system changes |

## Enforcement

Commit lint workflow validates messages on push and pull requests.