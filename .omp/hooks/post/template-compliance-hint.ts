#!/usr/bin/env bun

/**
 * Post-action hook: Template compliance hint
 * 
 * Provides hints about template compliance after file operations.
 */

import { readFileSync } from 'fs';

interface TemplateFiles {
  required: string[];
  optional: string[];
}

const REQUIRED_FILES: TemplateFiles = {
  required: [
    'AGENTS.md',
    'ARCHITECTURE.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    '.template-version',
    '.architecture.yml',
    '.github/CODEOWNERS',
  ],
  optional: [
    '.github/SECURITY.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.devcontainer/devcontainer.json',
  ],
};

function checkFile(file: string): boolean {
  try {
    Deno.statSync(file);
    return true;
  } catch {
    return false;
  }
}

function main() {
  const missing: string[] = [];
  
  for (const file of REQUIRED_FILES.required) {
    if (!checkFile(file)) {
      missing.push(file);
    }
  }
  
  if (missing.length > 0) {
    console.warn('\n⚠️  Template compliance hints:');
    console.warn(`Missing required files: ${missing.join(', ')}`);
    console.warn('See AGENTS.md for project conventions\n');
  }
  
  // Check CHANGELOG
  if (checkFile('CHANGELOG.md')) {
    const content = readFileSync('CHANGELOG.md', 'utf-8');
    if (!content.includes('[Unreleased]')) {
      console.warn('⚠️  CHANGELOG.md should have an [Unreleased] section');
    }
  }
  
  // Check .template-version
  if (checkFile('.template-version')) {
    const version = readFileSync('.template-version', 'utf-8').trim();
    if (!version.match(/^\d+\.\d+\.\d+$/)) {
      console.warn('⚠️  .template-version should contain a valid semver (e.g., 0.6.0)');
    }
  }
}

main();