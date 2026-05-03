# Development Container

This directory contains the development container configuration for tree-sitter-pike.

## Quick Start

1. Open the project in VS Code
2. Click "Reopen in Container" when prompted
3. Wait for the container to build
4. Run `bunx tree-sitter test` to verify setup

## Requirements

- [VS Code](https://code.visualstudio.com/) with Dev Containers extension
- [Docker](https://www.docker.com/)

## What's Included

- Node.js 20 with Bun runtime
- tree-sitter CLI
- GitHub CLI
- VS Code extensions:
  - tree-sitter syntax highlighting
  - ESLint
  - Prettier

## Manual Setup

If not using Dev Containers:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Generate parser
bash scripts/generate.sh

# Run tests
bunx tree-sitter test
```