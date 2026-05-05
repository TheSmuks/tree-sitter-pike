# Cut Release Skill

Automates the release process for tree-sitter-pike.

## Usage

```
agent: cut-release
version: <major.minor.patch>
```

## Steps

### 1. Version Validation

Validate the version format (semver):
- Major: Breaking changes
- Minor: New features (backward compatible)
- Patch: Bug fixes

### 2. Update CHANGELOG.md

1. Verify all `[Unreleased]` content exists
2. Add new `[<version>]` section with date
3. Move items from `[Unreleased]` to appropriate sections under new version

### 3. Update Version References

- Check for version constants in code
- Update any relevant version files

### 4. Verify WASM Artifact Build

- The release workflow (`.github/workflows/release.yml`) auto-builds the WASM on tag push
- It attaches `tree-sitter-pike.wasm` to a **draft release** on GitHub
- Before publishing, verify the draft release has the `tree-sitter-pike.wasm` asset attached

- To test locally before tagging:
    ```bash
    ./scripts/build-wasm.sh
    ```

### 5. Create Git Tag

```
git tag -a v<version> -m "Release v<version>"
```

### 6. Commit Changes

```
git add CHANGELOG.md
git commit -m "chore(release): bump to v<version>"
git push
git push --tags
```

## Requirements

- Clean working directory
- All tests pass
- No uncommitted changes

## Post-Release

After running, push:
```
git push && git push --tags
```

This triggers the release workflow which:
1. Builds the WASM artifact
2. Creates a draft release with `tree-sitter-pike.wasm` attached

Verify the draft release has the WASM asset, then publish it.