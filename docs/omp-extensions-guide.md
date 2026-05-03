# Oh My Pi Extensions Guide

This guide describes the Oh My Pi extensions available in the `.omp/` directory.

## Overview

Oh My Pi (OMP) extends agent capabilities with project-specific configuration, tools, and automation.

## Agents

Agents define the personality and expertise of AI assistants working on the project.

### code-reviewer.md

Reviewer agent specialized for this project:
- Code quality standards
- Style enforcement
- Test coverage requirements

### changelog-updater.md

Changelog maintenance agent:
- CHANGELOG.md format rules
- Version categorization
- Unreleased section management

### adr-writer.md

ADR creation agent:
- Architecture decision documentation
- ADR format compliance
- Consequence analysis

## Rules

Rules are hard constraints enforced by agents.

### changelog-required.md

Ensures all user-facing changes update CHANGELOG.md.

**Trigger**: Any PR touching non-docs, non-chore files.

### conventional-commits.md

Enforces conventional commit format.

**Format**: `<type>(<scope>): <description>`

### no-placeholders.md

Prevents placeholder values in deliverables.

**Check**: No `TODO`, `FIXME`, `XXX`, or placeholder text.

## Skills

Skills are reusable automation modules.

### cut-release

Automates release process:
- Version bumping
- Changelog generation
- Tag creation
- Release notes

### merge-to-main

Safe merge workflow:
- Branch up-to-date check
- Merge conflict detection
- Fast-forward enforcement

### template-guide

Template compliance checker:
- File structure validation
- Required file presence
- Version tracking

## Hooks

Hooks run at specific points in the agent workflow.

### pre/protect-main.ts

Prevents direct pushes to main branch.

**Enforcement**: No force push, no direct commit to protected branches.

### post/template-compliance-hint.ts

Hints about template compliance after actions.

**Trigger**: After file creation or modification.

## Tools

`.omp/tools/template-audit/` provides audit capabilities:

- Check file structure completeness
- Validate required files exist
- Report missing components

## Settings

`.omp/settings.json` configures:

- Default agent behavior
- Tool permissions
- Response formatting
- Conversation handling