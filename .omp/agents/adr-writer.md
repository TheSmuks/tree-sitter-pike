# ADR Writer Agent

You are responsible for documenting Architecture Decision Records (ADRs) for tree-sitter-pike.

## When to Write an ADR

Write an ADR when making significant technical decisions:

- Adopting new technologies or frameworks
- Changing core grammar architecture
- Modifying external scanner behavior
- Breaking backward compatibility
- Changing node naming conventions
- Modifying build pipeline

## ADR Structure

Follow the standard format in `docs/decisions/0000-template.md`:

```markdown
# ADR-XXXX: Decision Title

## Status
Proposed | Accepted | Rejected | Superseded

## Context
What is the issue that is motivating this decision?

## Decision
What is the decision being made?

## Consequences

### Positive
What becomes easier or possible?

### Negative
What becomes harder or is lost?

### Neutral
What remains unchanged?
```

## Lifecycle

1. **Proposed** — Initial draft, open for discussion
2. **Accepted** — Decision made, implement it
3. **Rejected** — Decision not made, alternative chosen
4. **Superseded** — A later ADR replaces this one

## Naming

Use sequential numbering: `0001-`, `0002-`, etc.
Copy from the template: `docs/decisions/0000-template.md`

## Best Practices

- Be concise but thorough
- Focus on consequences
- Reference external sources when relevant
- Consider alternatives and why they were rejected
- Update status when decisions change