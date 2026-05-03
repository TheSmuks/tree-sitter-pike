# Cut Release Skill

Automates the release process for tree-sitter-pike.

## Usage

```
/skill cut-release --version <version>
```

## Steps

### 1. Version Validation

Validate the version format (semver):
- Major: Breaking changes
- Minor: New features (backward compatible)
- Patch: Bug fixes

### 2. Update CHANGELOG.md

1. Verify all `[Unreleased]` content exists
2. Create new version section with date
3. Move unreleased content to new section
4. Create fresh `[Unreleased]` header

### 3. Update Version References

- Check for version constants in code
- Update any relevant version files

### 4. Create Git Tag

```
git tag -a v<version> -m "Release v<version>"
```

### 5. Commit Changes

```
git add CHANGELOG.md
git commit -m "chore: prepare release v<version>"
```

## Requirements

- Clean working directory
- All tests passing
- No uncommitted changes

## Post-Release

After running, push:
```
git push origin main
git push --tags
```