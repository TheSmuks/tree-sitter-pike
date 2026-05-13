# AGENTS.md

## Project Overview

| Field | Value |
|-------|-------|
| **Project name** | tree-sitter-pike |
| **Project type** | tree-sitter grammar |
| **Target language** | Pike 8.0.1116 |
| **Implementation** | TypeScript strict |
| **Primary maintainer** | @TheSmuks |
| **License** | MIT |

## Source grammar

`grammar.ts` — TypeScript strict, the authoritative source. Compiled to `grammar.js` via:

```
bun build grammar.ts --outfile grammar.js --target node --format esm
```

Do **not** edit `grammar.js` directly; it is regenerated from `grammar.ts`.

## Reference grammar

The authoritative Pike grammar is at `pike-ai/Pike/src/language.yacc`. Use it as the ground truth for any grammar decisions.

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

## Node naming

Named nodes use lowercase snake_case: `identifier`, `type`, `function_decl`, `class_decl`, `lambda_expr`, etc. Naming follows ast-grep conventions for consistent pattern matching.

## Code Style

- **Indentation**: 2 spaces (per `.editorconfig`)
- **TypeScript**: strict mode
- **Grammar rules**: lowercase snake_case for named nodes
- **External scanner**: C code in `src/scanner.c` for Pike-specific tokens (hash-string literals)

## Module Size Guidelines

| Kind | Soft limit | Hard limit | Notes |
|------|-----------|-------------|-------|
| Source files | 800 lines | 2000 lines | grammar.ts is inherently large (~3000+ lines) |
| Functions | 80 lines | 120 lines | Grammar rule helper functions |
| External scanner | 500 lines | 800 lines | src/scanner.c |

**Rationale**: tree-sitter grammar files tend to be large by nature. The soft limit is set to 800 to encourage modularization where practical, but grammar.ts is grandfathered as an exception due to language complexity.

## Project Structure

```
.
├── AGENTS.md                      # This file
├── ARCHITECTURE.md                # Architecture documentation
├── README.md                      # Project overview
├── CHANGELOG.md                   # Keep a Changelog
├── CONTRIBUTING.md                # Contribution guidelines
├── grammar.ts                     # Authoritative grammar (TypeScript)
├── grammar.js                     # Compiled grammar (generated)
├── src/
│   ├── scanner.c                  # External scanner (hash-string literals)
│   ├── parser.c                  # Generated parser
│   └── tree_sitter/
├── test/
│   └── corpus/                   # Corpus tests
├── examples/                     # Pike source examples
├── queries/                      # tree-sitter queries
├── rules/                        # ast-grep rules
├── docs/                         # Project documentation
│   └── decisions/               # Architecture decision records
├── scripts/                      # Helper scripts
├── .github/
│   ├── workflows/               # CI workflows
│   ├── ISSUE_TEMPLATE/         # Issue templates
│   ├── CODEOWNERS
│   ├── SECURITY.md
│   └── PULL_REQUEST_TEMPLATE.md
└── .omp/                        # Legacy Oh My Pi agent config (retained for reference)
```

## Hermes Skills

Project-specific Hermes skills are installed at `~/.hermes/skills/tree-sitter-pike/`:

| Skill | Purpose |
|-------|---------|
| `ts-pike-cut-release` | Release workflow: version, changelog, tag, verify WASM |
| `ts-pike-merge-to-main` | PR lifecycle: create, monitor CI, fix failures, merge |

Load when relevant with `skill_view(name='ts-pike-cut-release')` or `skill_view(name='ts-pike-merge-to-main')`.

## Operating Principles

### Changelog Required

CHANGELOG.md must be updated for all user-facing changes to `grammar.ts`, `grammar.js`, `src/scanner.c`, `src/parser.c`, `test/corpus/**`, or `examples/**`.

Exemptions: documentation-only changes, `chore:` commits, changes to only `.omp/`, `.github/`, `.devcontainer/`.

Entries go under `[Unreleased]` in the correct section (Added, Changed, Deprecated, Removed, Fixed, Security). Use imperative mood.

### No Placeholders

No `TODO`, `FIXME`, `XXX`, `HACK`, `placeholder`, `TEMP`, or template placeholders in committed code or documentation. Exception: `TODO(#issue): description` tied to an open issue.

### Code Review Standards

When reviewing grammar changes:
1. Reference grammar compliance — align with `pike-ai/Pike/src/language.yacc`
2. Node naming — lowercase snake_case for all named nodes
3. Test coverage — new grammar features require corpus tests
4. Parse correctness — example files must parse without errors
5. No TypeScript errors in grammar.ts

### Environment Setup

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$HOME/.bun/bin:$(pwd)/node_modules/.bin:$PATH"
```

## Testing

- **Unit tests**: `bunx tree-sitter test` — runs corpus tests in `test/corpus/`
- **Parse examples**: `bunx tree-sitter parse examples/*.pike` — validates against real Pike files
- **Coverage**: 210+ corpus tests covering Pike syntax

## Error Handling

- tree-sitter provides automatic error recovery during parsing
- External scanner handles Pike-specific tokens gracefully
- Grammar uses nullable rules and explicit error productions where needed
- Parse failures on valid Pike code indicate a grammar gap — file an issue

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | Build grammar, generate parser, run tests, parse examples |
| `commit-lint.yml` | push/PR | Enforce conventional commit format |
| `changelog-check.yml` | PR | Ensure CHANGELOG.md updated on relevant changes |
| `blob-size-policy.yml` | push | Warn on suspiciously large file additions |
| `branch-cleanup.yml` | push to main | Auto-delete merged branches |

## Agent Behavior

- **Code review**: Always review grammar changes against the reference grammar (`pike-ai/Pike/src/language.yacc`)
- **Testing**: All PRs must pass `bunx tree-sitter test` before merge
- **Node naming**: Verify new nodes follow lowercase snake_case convention
- **Documentation**: New grammar features require corpus test coverage
- **Breaking changes**: Must update CHANGELOG.md and add ADR in `docs/decisions/`

## Conventions

### Branches

Format: `<type>/<ticket>-<description>` or `<type>/<description>`

Types:
- `feat/` — New grammar feature
- `fix/` — Bug fix
- `docs/` — Documentation only
- `chore/` — Maintenance
- `refactor/` — Code restructuring

### Commits

Format: `<type>(<scope>): <description>`

Types follow conventional commits:
- `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

Scope is optional but recommended (e.g., `feat(scanner):`, `fix(grammar):`)

### Changelog

Follow [Keep a Changelog](https://keepachangelog.com/) format:
- Added, Changed, Deprecated, Removed, Fixed, Security
- `[Unreleased]` header for unreleased changes
- Use passive voice, imperative mood for descriptions

## Template Version

This project uses [ai-project-template](https://github.com/TheSmuks/ai-project-template) v0.6.0.

See `.template-version` for the exact version.