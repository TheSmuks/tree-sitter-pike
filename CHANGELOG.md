# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-05-05

### Fixed

- Add `scripts/build-wasm.sh` helper script for local WASM artifact builds
- Update `cut-release` skill to document WASM artifact verification in release process
- Fix `release.yml` workflow to ensure WASM artifact is properly uploaded (add debug logging, explicit GITHUB_TOKEN)

## [Unreleased]

### Added

- Add corpus test for lambda in mapping literal expression context (#13)

### Changed

### Deprecated

### Removed

### Fixed

### Security