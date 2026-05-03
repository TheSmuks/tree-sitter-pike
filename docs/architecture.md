# Architecture (Template Reference)

This document describes the general architecture patterns used in projects adopting ai-project-template.

## Project Structure

```
project/
├── src/                    # Source code
├── test/                   # Tests
├── docs/                   # Documentation
│   └── decisions/        # Architecture Decision Records
├── scripts/               # Build/utility scripts
├── .github/
│   ├── workflows/        # CI/CD pipelines
│   ├── ISSUE_TEMPLATE/   # GitHub issue templates
│   └── *.md              # GitHub config files
├── .omp/                  # Agent configuration
│   ├── settings.json
│   ├── agents/
│   ├── rules/
│   ├── skills/
│   ├── hooks/
│   └── tools/
├── .devcontainer/         # Development container
├── .architecture.yml       # Architecture thresholds
└── AGENTS.md              # Agent instructions
```

## Module Size Guidelines

`.architecture.yml` enforces limits to keep code maintainable:

| Setting | Purpose |
|---------|---------|
| `max_file_lines` | Soft limit for file length |
| `max_file_lines_hard` | Hard limit; exceptions need ADR |
| `max_function_lines` | Soft limit for function length |
| `ignore_patterns` | Files excluded from limits |

## Architecture Decision Records (ADRs)

ADRs document significant architectural decisions:

- **When to write**: Major technical choices, framework adoption, breaking changes
- **Format**: See `docs/decisions/0000-template.md`
- **Numbering**: Sequential (0001, 0002, etc.)
- **Status**: Proposed → Accepted/Rejected/Superseded

## Build Pipeline

The typical build pipeline:
1. Lint/format check
2. Type check
3. Compile/bundle
4. Test
5. Security audit (optional)

## Quality Gates

Automated checks before merge:
- Commit message lint
- Changelog updated
- No large file additions
- Tests pass
- Security audit (if applicable)

## Agent Integration

The `.omp/` directory configures agent behavior:
- **Agents**: What the agent is and how it behaves
- **Rules**: What the agent must enforce
- **Skills**: What the agent can do
- **Hooks**: Triggers for specific actions
- **Tools**: What tools the agent can use

See [docs/agent-files-guide.md](agent-files-guide.md) for details.