# Merge to Main Skill

Safe merge workflow for merging feature branches to main.

## Usage

```
/skill merge-to-main [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--branch <name>` | Branch to merge (default: current) |
| `--squash` | Squash commits before merge |
| `--no-ff` | Never fast-forward |

## Pre-Check

Before merge, verify:

1. **Branch is current** — `git fetch && git rebase origin/main`
2. **Tests pass** — `bunx tree-sitter test`
3. **Examples parse** — `bunx tree-sitter parse examples/*.pike`
4. **CHANGELOG updated** — If applicable
5. **No conflicts** — `git merge-base origin/main HEAD`

## Merge Process

### Standard Merge

```
git checkout main
git pull origin main
git merge --no-ff <branch>
git push origin main
git branch -d <branch>
```

### Squash Merge

```
git checkout main
git pull origin main
git merge --squash <branch>
git commit -m "feat: <description>"
```

## Cleanup

After successful merge:
- Delete the feature branch locally
- Delete the feature branch remotely (if exists)

## Rollback

If issues are discovered post-merge:

```
git revert <commit>
git push origin main
```

## Safety Checks

- Require all CI checks pass before merge
- Require up-to-date with main
- Require no merge conflicts
- Require clean commit history (squash if needed)