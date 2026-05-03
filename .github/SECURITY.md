# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in tree-sitter-pike, please report it responsibly.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Email the maintainer directly at the GitHub profile
3. Include a detailed description of the vulnerability
4. Provide steps to reproduce
5. If possible, suggest a fix

### What to Expect

- Acknowledgment of your report within 48 hours
- Regular updates on the progress
- Credit for the discovery (unless you prefer anonymity)

### Scope

tree-sitter-pike is a parser generator grammar. Security concerns are limited to:

- Maliciously crafted Pike source files that cause parser crashes
- Injection through grammar rules
- Dependencies with known vulnerabilities

This project does not:
- Execute arbitrary code
- Access files beyond the parsed input
- Make network connections

## Security Updates

Security patches will be released as patch versions (e.g., 1.0.1) and announced in the release notes.