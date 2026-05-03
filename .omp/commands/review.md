# /review Command

Performs a comprehensive code review for the current changes.

## Usage

```
/review [options]
```

## Options

| Option | Description |
|--------|-------------|
| `--files <path>` | Review specific files |
| `--focus <area>` | Focus on specific area (grammar, scanner, tests) |
| `--verbose` | Include detailed analysis |

## What Gets Reviewed

### Grammar Changes
- Compliance with reference grammar
- Node naming conventions
- Test coverage
- Parse correctness

### Scanner Changes
- C code quality
- Token handling correctness
- Integration with tree-sitter

### Documentation
- Accuracy
- Completeness
- Format consistency

### Tests
- Coverage of new features
- Edge case handling
- Correct expected output

## Output

The review produces:

1. **Summary** — Overview of changes
2. **Issues** — Blocking problems requiring changes
3. **Suggestions** — Non-blocking recommendations
4. **Approval Status** — Ready to merge or needs work

## Examples

```
/review                    # Full review
/review --focus grammar    # Focus on grammar changes
/review --files src/scanner.c  # Review specific file
```