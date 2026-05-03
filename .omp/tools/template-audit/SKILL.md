# Template Audit Tool

Checks project compliance with ai-project-template v0.6.0.

## Files Checked

### Required Files

| File | Description |
|------|-------------|
| `AGENTS.md` | Agent instructions and project conventions |
| `ARCHITECTURE.md` | Architecture documentation |
| `CHANGELOG.md` | Keep a Changelog format |
| `CONTRIBUTING.md` | Contribution guidelines |
| `.template-version` | Template version number |
| `.architecture.yml` | Architecture thresholds |
| `.github/CODEOWNERS` | Code ownership |
| `.github/SECURITY.md` | Security policy |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR template |

### Required Directories

| Directory | Description |
|-----------|-------------|
| `.omp/` | Agent configuration |
| `.omp/agents/` | Agent definitions |
| `.omp/rules/` | Enforcement rules |
| `.omp/skills/` | Agent skills |
| `.omp/hooks/` | Action hooks |
| `.omp/tools/` | Agent tools |
| `.github/workflows/` | CI workflows |
| `docs/decisions/` | Architecture decision records |

### Required Workflows

| Workflow | Description |
|----------|-------------|
| `ci.yml` | Primary build pipeline |
| `commit-lint.yml` | Commit message linting |
| `changelog-check.yml` | Changelog validation |
| `blob-size-policy.yml` | File size monitoring |
| `branch-cleanup.yml` | Stale branch cleanup |

## Usage

```bash
bun run .omp/tools/template-audit/audit.ts [--check <area>]
```

## Check Areas

- `files` — Required file presence
- `workflows` — CI workflow existence
- `structure` — Directory structure
- `version` — Template version
- `all` — All checks (default)

## Exit Codes

- `0` — All checks pass
- `1` — Some checks fail
- `2` — Fatal error