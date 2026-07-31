# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`#define` is modelled instead of swallowed.** A directive used to be one
  opaque `preprocessor_directive` token, so no identifier inside any macro body
  had a node or a position, and every position-driven consumer — hover,
  go-to-definition, completion, references — could answer nothing anywhere
  inside a macro. `preproc_define` now carries `name`, `parameters`
  (`preproc_params` / `preproc_param`, present exactly when the paren abuts the
  name) and `body` (`preproc_body`).

  The body is a permissive token sequence, not an expression or a statement,
  because a macro body need not be either: `#define DO_IF_DEBUG(X) X`,
  `#define BODY_TR_ATTRS "class=x"` and bodies that stop mid-expression are all
  ordinary. Identifiers, numbers, strings, character literals and backtick
  operator names are real nodes; everything else collapses into hidden chunk
  tokens. Across the Roxen 6.1 corpus that is 1403 defines — every one of them
  — exposing 4479 identifiers that had no position before.

  Three external-scanner tokens do the work, because all three turn on
  something the LR lexer cannot see: whether the paren abuts the name, where the
  logical line ends, and which body characters no rule can tokenize. The scanner
  consumes line continuations itself — tree-sitter skips anonymous whitespace
  extras inside the generated lexer, so once the scanner declines a position it
  is not consulted again until after the next real token, and a body token on a
  spliced line would otherwise never reach it. A fourth external token is an
  error sentinel: tree-sitter marks every external symbol valid at once while
  recovering, and without it a macro body would swallow arbitrary source.

- `macro_invocation_bare_stmt` — a macro invocation as a statement with no `;`,
  for macros whose expansion carries its own terminator: `SERVER_DEBUG("…")`,
  `CASE_ASSIGN(browser_timeout)` as a `case` label, `LOG_HANDLE_END()`. Needs
  declared conflicts plus `prec.dynamic(-2)`; static precedence appears to work
  and silently breaks `macro_statement`, because tree-sitter then settles
  `identifier • '('` before GLR ever sees it. `macro_empty_argument_list` is
  reachable only from this rule — admitting an empty list into
  `macro_argument_list` makes `int foo();` a macro invocation as readily as a
  function prototype.

- `macro_argument_fragment` — a macro argument that begins with a binary
  operator, completed by whatever the expansion splices it onto:
  `"…unparsed" DO_IF_DEBUG (+ sprintf (…))`. Ranked below `_expr` so `(-x)`
  stays unary negation.

- `_function_type` accepts `'(' identifier ')'`, for a macro standing in for a
  whole signature: `function(DEFVAR) defvar` with
  `#define DEFVAR mixed...:object`. The `:` the real signature form requires is
  what keeps the two apart.

- **The conditional directives are modelled too.** `#if`, `#ifdef`, `#ifndef`,
  `#endif` and `#undef` were folded into the same opaque
  `preprocessor_directive` token, which hid the names that decide what compiles:
  2316 identifier occurrences across the Roxen 6.1 corpus, at none of which any
  position-driven consumer could answer. `preproc_if` carries a `name` field for
  the `#ifdef`/`#ifndef` form and a `condition` for `#if`; `preproc_undef`
  carries a `name`; `preproc_endif` closes. They reuse `preproc_body` for the
  condition, because a condition is preprocessor syntax rather than Pike —
  `constant(X)` and `defined(X)` are directives of the preprocessor's own
  expression language, confirmed against pike v8.0.1116.

  All of them remain `extras`, so a conditional region is still spliced rather
  than made a subtree. Modelling the region was measured and rejected; see the
  comment on `preproc_if` for the numbers.

  `#else`/`#elif` deliberately stay one token. `preproc_branch` is visible glue
  inside `preproc_conditional_expr`, and as a rule its first token is a bare
  `#`, which at an expression boundary also starts every directive extra — the
  parser takes the extra and the enclosing declaration becomes an ERROR. The
  structure would have bought the 9 `#elif` directives in the whole corpus.

- **A macro statement argument may declare a local, or end without a `;`.**
  `macro_argument_stmts` took control-flow and expression statements only.
  Roxen's `ISIP(H,CODE)` is called all four ways its expansion allows:
  `ISIP(ip, mixed foo; … return foo;)`, `ISIP(host, return host)` and
  `ISIP(host, callback(host,@args);return)` — the expansion supplies the final
  `;`. `macro_argument_decl` takes one declarator only; `local_declaration`'s
  comma is ambiguous with both the argument separator and an expression
  argument, and admitting it cascaded into conflicts between
  `local_declaration` and `identifier_expr`, `_id_expr` and `primary_expr`.

### Fixed

- `string_concat` accepts a `macro_invocation` among its elements, so a
  function-like macro can sit between adjacent literals as long as it expands to
  a string: `"<tr " BODY_TR_ATTRS (row) ">"`.

- `string_literal` spans a `\`+newline splice. Verified against pike v8.0.1116:
  `write("%O", "a\<newline>b")` prints `"ab"`. Previously only the opaque
  `#define` token tolerated it, which is why the gap surfaced the moment macro
  bodies started being parsed.

  Roxen 6.1 now fails on four files rather than nine, with none regressed. Two
  of the four are Roxen's own syntax errors, so the floor is two.

## [1.4.1] - 2026-07-30

### Fixed

- Parse a declaration in a `for` condition: `for (keys; string key;)`. Pike does
  not special-case conditions per statement — `comma_expr` itself carries
  `simple_type2 local_name_list` (language.yacc), so a declaration is valid in
  every position that takes a comma expression, and `local_name_list` does not
  require an initialiser. The grammar had `cond_decl` for `if`/`while`/`switch`/
  `catch` but demanded `= value`, and `for`'s condition accepted no declaration
  at all. The initialiser is now optional and `for`'s condition takes
  `cond_decl`. Verified against pike v8.0.1116: `if (string x)`,
  `while (string x)` and `for (0; string k;)` all compile.

  No new node types; `cond_decl`'s `value` field is simply absent when the
  source omits it.

  Found in the Roxen 6.1 corpus, which now fails on ten files rather than
  eleven, with none regressed.

## [1.4.0] - 2026-07-30

### Added

- Parse a named class in expression position: `Write_back wb = class Write_back
  { … };` and `lock = class lambda17 { … }();`. Pike has one class production —
  `class: TOK_CLASS line_number_info optional_identifier` — reached from
  expression position via `expr4: … | implicit_modifiers class`, so a name
  there is as valid as its absence; the grammar previously put it in an `ERROR`
  node. Two new nodes: `named_class_expr`, and `class_instantiation` for the
  immediately-called form, which is a distinct thing (`= class Foo { … }` binds
  a program, `= class Foo { … }()` binds an object).

  The name is *not* modelled as an optional field on `anon_class`. That was
  tried first and reverted: it makes `class Foo { … }` ambiguous with
  `class_decl` everywhere a declaration is legal, tree-sitter resolves that
  ambiguity statically so no amount of `prec.dynamic` changes it, and the
  expression reading then completes by running through
  `preproc_conditional_expr` into an `#else` branch and consuming the semicolon
  of the following declaration — silently breaking files that parsed before.
  `named_class_expr` is instead reachable only from an assignment or
  initialiser right-hand side, where a statement can never begin.

  Found in the Roxen 6.1 corpus, where it accounted for three of the fourteen
  files the grammar could not parse; that corpus now fails on eleven, with no
  file regressed.

## [1.3.3] - 2026-07-16

### Fixed

- Parse unmodified function prototypes. `Dog getDog();` did not parse as a
  declaration: it split into a bare-identifier declaration (`Dog`) plus an
  expression statement (`getDog();`), so the function was never declared and the
  return type was never a `type_ref`. This is the same dynamic-precedence defect
  fixed for `variable_decl` in 1.3.2, in the sibling rule: `function_decl`
  already accepted a `;` body (`choice(field('body', $.block), ';')`) but
  carried no `prec.dynamic`, so the split won on `expression_statement`'s
  `prec.dynamic(1)`. Prototypes with a leading modifier (`protected Dog f();`)
  and definitions with a body were unaffected, which is why it went unnoticed —
  only an unmodified prototype was mis-parsed. Pike accepts prototypes as
  forward declarations. `function_decl` now carries `prec.dynamic(2)`, matching
  `variable_decl`. Downstream tooling regains goto-definition, find-references,
  rename, and completion for prototyped functions — notably, renaming a class
  no longer silently leaves a dangling return type on its prototypes.

## [1.3.2] - 2026-07-16

### Fixed

- Parse file-scope and class-body variables with user-defined types.
  `Greeter g = Greeter("World");` did not parse as a declaration: it split into
  a bare-identifier declaration (`Greeter`) plus an expression statement
  (`g = Greeter("World");`), so the variable was never declared and the type
  name was never a `type_ref`. Both parses were valid to the GLR parser and the
  split won on dynamic precedence, since `expression_statement` carries
  `prec.dynamic(1)` (to outrank `macro_invocation_stmt`) while `variable_decl`
  had none. Builtin types (`int n = 5;`) and function bodies were unaffected,
  which is why it went unnoticed — only a user-defined type at file or
  class-body scope was mis-parsed. Pike accepts this construct (a file is a
  class, so it is an ordinary member variable). `variable_decl` now carries
  `prec.dynamic(2)`, which keeps `expression_statement` ahead of
  `macro_invocation_stmt` as intended. Downstream tooling regains
  goto-definition, find-references, rename, and completion for module-level
  object variables.

## [1.3.1] - 2026-07-08

### Fixed

- Accept horizontal whitespace between `#` and the string delimiter in
  hash-strings (`# "…"` now parses identically to `#"…"`) and in string
  includes (`# string "file"` as well as `#string "file"`). Pike's compiler
  accepts spaces/tabs there; the grammar previously produced an `ERROR` node,
  which surfaced as a spurious diagnostic in the language server. Newlines are
  still rejected (a bare `#` on its own line is a preprocessor directive). The
  fix is in the external scanner (`HASH_STRING`) and the `string_include` rule.

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
