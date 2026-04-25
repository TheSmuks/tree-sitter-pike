#!/usr/bin/env bash
set -euo pipefail
bun build grammar.ts --outfile grammar.js --target node --format esm
bunx tree-sitter generate "$@"
