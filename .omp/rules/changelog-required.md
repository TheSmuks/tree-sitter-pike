# Rule: Changelog Required

## Description

CHANGELOG.md must be updated for all user-facing changes.

## Trigger

This rule applies when a pull request modifies:
- `grammar.ts`
- `grammar.js`
- `src/scanner.c`
- `src/parser.c`
- `test/corpus/**`
- `examples/**`

## Exemptions

- Documentation-only changes
- `chore:` commit type
- Changes to only `.omp/`, `.github/`, `.devcontainer/`

## Requirement

The PR must include an update to `CHANGELOG.md` under the `[Unreleased]` section with:

1. Appropriate category (Added, Changed, Fixed, etc.)
2. Brief description of the change
3. Imperative mood ("Add support for..." not "Added support for...")

## Enforcement

PR will be blocked if CHANGELOG.md is not updated when required.

## Examples

**Required** — Grammar change:
```
### Added
- Support for Pike's splice assignment syntax
```

**Required** — Scanner fix:
```
### Fixed
- Correct handling of hash-string literals in raw strings
```

**Exempt** — Documentation:
```
docs: Update README with new examples
```
(No CHANGELOG update needed)