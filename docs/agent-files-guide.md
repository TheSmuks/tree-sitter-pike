# Agent Files Guide

This guide documents the purpose and usage of agent configuration files in the `.omp/` directory.

## Directory Structure

```
.omp/
├── settings.json          # Global agent settings
├── agents/                # Agent personalities and instructions
│   ├── code-reviewer.md
│   ├── changelog-updater.md
│   └── adr-writer.md
├── rules/                 # Enforcement rules
│   ├── changelog-required.md
│   ├── conventional-commits.md
│   └── no-placeholders.md
├── commands/              # Agent commands
│   └── review.md
├── skills/                # Agent skill modules
│   ├── cut-release/
│   ├── merge-to-main/
│   └── template-guide/
├── hooks/                 # Pre/post action hooks
│   ├── pre/
│   │   └── protect-main.ts
│   └── post/
│       └── template-compliance-hint.ts
└── tools/                 # Agent tools
    └── template-audit/
```

## Settings

`.omp/settings.json` contains global agent configuration:

- Default behaviors
- Tool permissions
- Response formatting rules

## Agents

### code-reviewer.md

Instructions for reviewing code changes:
- What to look for in PRs
- Commenting guidelines
- Approval criteria

### changelog-updater.md

Instructions for maintaining CHANGELOG.md:
- Changelog format requirements
- Categorization guidelines
- Version management

### adr-writer.md

Instructions for writing Architecture Decision Records:
- ADR format and structure
- When to write an ADR
- ADR lifecycle

## Rules

Rules are enforced by the agent system:
- `changelog-required.md` — ensures CHANGELOG.md is updated
- `conventional-commits.md` — enforces commit message format
- `no-placeholders.md` — prevents placeholder values in deliverables

## Commands

`.omp/commands/review.md` defines the `/review` command available to agents.

## Skills

Skills are self-contained modules:
- **cut-release** — Release process automation
- **merge-to-main** — Safe merge workflow
- **template-guide** — Template compliance checking

## Hooks

Hooks run at specific points:
- **pre/protect-main.ts** — Prevents direct pushes to main
- **post/template-compliance-hint.ts** — Hints about template compliance

## Tools

`.omp/tools/template-audit/` — Audit tool for checking template compliance.

## Integration

These files are read by the Oh My Pi agent system to configure agent behavior. Changes to these files take effect on the next agent session.