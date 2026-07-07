# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-07-07

### Added

- Parse macro invocations that take statement arguments in block/statement
  context (`macro_invocation_stmt` is now valid inside `_stmt`, with a new
  `macro_argument_stmts` node for statement-sequence arguments), e.g.
  `RUN_MAYBE_BLOCKING(cond, 0, 1, MSG("…"); return 0;)` and
  `IF_ELSE_PAGED_SEARCH(if (…) { … },)`. Brings the real-world distribution
  parse rate to **624/624 (100%)**.

### Fixed

- Parse `modifier`-qualified local function declarations inside a block
  (`{ protected string helper(string s) { … } }`), e.g. functions grouped
  under a `protected { … }` modifier block. `local_function_decl` now accepts
  leading modifiers like `local_declaration` already did. Raises the
  distribution parse rate to 622/624 (99.68%).

### Added

- Parse preprocessor conditionals that split a single expression into
  alternative fragments (`x = #if A ... #else B ... #endif y`) as a new
  `preproc_conditional_expr` node with `branch` fields. Raises the real-world
  distribution parse rate from 617/624 to 621/624 (98.9% → 99.5%). New
  `preproc_branch` node covers `#else`/`#elif`/`#elseif`/`#elifdef`/`#elifndef`
  (previously all folded into `preprocessor_directive`).
- Standard multi-language bindings under `bindings/` (C, Go, Node, Python, Rust, Swift), matching the layout produced by `tree-sitter init`, so the grammar can be consumed as a native package from each ecosystem.
- Build manifests for each binding: `binding.gyp`, `Cargo.toml`, `CMakeLists.txt`, `go.mod`, `Makefile`, `Package.swift`, `pyproject.toml`, `setup.py`.
- `queries/injections.scm` (comment-language injection), `queries/folds.scm` (fold regions), and `queries/indents.scm` (indentation rules).

### Changed

- `tree-sitter.json`: enable all bindings, register `locals` and `injections` query files, and use the full `https://github.com/TheSmuks/tree-sitter-pike` repository URL (the `github:` shorthand produced an invalid Go module path and malformed Cargo/npm URLs).
- `package.json`: add `main`/`types` pointing at the Node binding, node binding dependencies (`node-addon-api`, `node-gyp-build`), a `files` allowlist, and real `scripts` (`generate`, `check`, `test`, `build-wasm`) that the README already documented but did not exist.
- `.gitattributes`: mark generated bindings and manifests `linguist-generated` so they are excluded from GitHub language statistics.

### Fixed

- `.gitignore` no longer ignores committed/needed artifacts (`bindings/`, `src/parser.c`, `src/parser.h`, `src/tree_sitter/`); added standard per-language build-artifact ignores instead.

## [1.2.2] - 2026-05-14

### Changed

- Remove 5 unnecessary conflict declarations from grammar: `postfix_expr`, `inherit_specifier`, `macro_statement/_id_expr`, `macro_statement/_id_expr/identifier_expr`, `expression_statement/macro_invocation_stmt`. Grammar now compiles with zero warnings.

## [1.2.1] - 2026-05-14

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
