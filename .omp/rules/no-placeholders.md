# Rule: No Placeholders

## Description

Deliverables must not contain placeholder values. All content must be concrete and complete.

## Prohibited Placeholders

### Code Placeholders

```
TODO                     # Unless accompanied by issue number
FIXME                    # Unless accompanied by issue number
XXX                      # Unless accompanied by issue number
HACK                     # Unless accompanied by issue number
BUG                      # Unless accompanied by issue number
placeholder
TEMP
```

### Template Placeholders

```
<!-- TODO: fill in -->
{{ placeholder }}
{{change_me}}
<your_name>
<description>
[INSERT_X]
[INSERT_Y]
```

### Documentation Placeholders

```
... (expand)
see docs for more
more details to come
TODO: document
```

## Exceptions

- `TODO(#issue): description` — OK if tied to an issue
- `FIXME(#issue): description` — OK if tied to an issue

## Rationale

Placeholders in code or documentation indicate incomplete work that may ship. Concrete values ensure:
- Code is immediately usable
- Documentation is accurate
- No missing information

## Enforcement

Code review and automated checks will flag placeholder usage.