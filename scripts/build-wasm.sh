#!/usr/bin/env bash
# Builds the tree-sitter-pike.wasm artifact from a clean tree.
set -euo pipefail

# Build grammar
bun build grammar.ts --outfile grammar.js --target node --format esm
bunx tree-sitter generate

# Build WASM
bunx tree-sitter build --wasm

# Report size
if [[ "$OSTYPE" == darwin* ]]; then
    size=$(stat -f%z tree-sitter-pike.wasm 2>/dev/null || echo "unknown")
else
    size=$(stat -c%s tree-sitter-pike.wasm 2>/dev/null || echo "unknown")
fi
echo "Built: tree-sitter-pike.wasm (${size} bytes)"