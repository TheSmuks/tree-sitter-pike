# ADR-0001: Adopt ai-project-template v0.6.0

## Status

Accepted

## Context

tree-sitter-pike was created without standardized project infrastructure. As the project grows and attracts contributors, we need consistent conventions for:

- Contribution guidelines
- CI/CD quality gates
- Agent behavior expectations
- Architecture documentation

The [ai-project-template](https://github.com/TheSmuks/ai-project-template) provides a battle-tested foundation for TypeScript projects with Oh My Pi integration.

## Decision

We adopt ai-project-template v0.6.0 using the incremental adoption path documented in the template's ADOPTING.md.

### What's adopted

- **Documentation**: AGENTS.md (merged), ARCHITECTURE.md, CHANGELOG.md, CONTRIBUTING.md
- **Agent config**: .omp/ directory with agents, rules, skills, hooks
- **Quality gates**: commit-lint, changelog-check, blob-size-policy, branch-cleanup workflows
- **GitHub config**: CODEOWNERS, dependabot.yml, SECURITY.md, issue templates
- **Dev container**: .devcontainer/ for consistent development environment

### What's NOT adopted

- SETUP_GUIDE.md — not relevant to existing projects
- ADOPTING.md — template meta-doc
- UPGRADING.md — template meta-doc

### Key adaptations

- **AGENTS.md**: Existing project-specific content preserved; template sections filled with Pike grammar values
- **.editorconfig**: Kept existing 2-space indentation (per ADOPTING.md: document what codebase already follows)
- **CI workflow**: Existing ci.yml kept as primary; added concurrency and permissions from template
- **Module limits**: grammar.ts is inherently large (~3000+ lines); thresholds set accordingly

## Consequences

### Positive

- Consistent contribution experience for new contributors
- Automated quality gates catch issues early
- Clear documentation of project conventions
- Agent behavior expectations documented

### Negative

- Additional files to maintain
- CI workflows add some overhead

### Neutral

- Core grammar development workflow unchanged
- Existing tests and examples continue to work

## References

- [ai-project-template](https://github.com/TheSmuks/ai-project-template)
- [Keep a Changelog](https://keepachangelog.com/)
- [Conventional Commits](https://www.conventionalcommits.org/)