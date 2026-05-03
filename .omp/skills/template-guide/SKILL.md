# Template Guide Skill

Validates project compliance with ai-project-template v0.6.0.

## Usage

```
/skill template-guide --check [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--all` | Check all template requirements |
| `--files` | Check required files exist |
| `--workflows` | Check CI workflows |
| `--agents` | Check agent configuration |

## Checks

### Required Files

Verify existence of:
- `AGENTS.md`
- `ARCHITECTURE.md`
- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `.template-version`
- `.architecture.yml`
- `.github/CODEOWNERS`
- `.github/SECURITY.md`
- `.github/PULL_REQUEST_TEMPLATE.md`

### Directory Structure

Verify `.omp/` exists with:
- `settings.json`
- `agents/`
- `rules/`
- `skills/`
- `hooks/`
- `tools/`

### CI Workflows

Verify `.github/workflows/` contains:
- `ci.yml`
- `commit-lint.yml`
- `changelog-check.yml`
- `blob-size-policy.yml`
- `branch-cleanup.yml`

### Version Check

Verify `.template-version` contains valid version.

## Output

Returns a report of:
- Passed checks
- Failed checks with remediation steps

## Auto-Fix

Some checks support auto-fix:
```
/skill template-guide --fix
```