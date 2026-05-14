# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Bare function calls at statement level (`f(args);`) now parse as `expression_statement` with `postfix_expr > argument_list`, not `macro_invocation_stmt`. This enables parameter name inlay hints in the Pike Language Server (#18). Complex macros with type expressions (`CBFUNC(function(mixed|void:int), x)`) continue to parse as `macro_invocation_stmt`.

## [1.2.0] - 2026-05-14

### Added

- Structured `preproc_include` node with named `path` field for `#include` directives (#17)
- `system_lib_string` node type for angle-bracket include paths (`<foo.h>`)
- Corpus tests for `preproc_include` with quoted strings, angle brackets, and inside functions

### Changed

- Extract `#include` from generic `preprocessor_directive` token into structured `preproc_include` rule with `path` field

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
