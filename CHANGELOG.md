# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.2] - 2026-05-13

### Added

- Add corpus test for lambda in mapping literal expression context (#13)
- Adapt `.omp` agent config to Hermes skills (`ts-pike-cut-release`, `ts-pike-merge-to-main`) with operating principles baked into AGENTS.md

### Fixed

- Exclude trailing newline from `preprocessor_directive` node for `#else` and `#endif` (#15)

## [1.1.1] - 2026-05-05

### Fixed

- Add `scripts/build-wasm.sh` helper script for local WASM artifact builds
- Update `cut-release` skill to document WASM artifact verification in release process
- Re-release v1.1.1 to properly trigger `release.yml` workflow (v1.1.0 had no WASM artifact)
