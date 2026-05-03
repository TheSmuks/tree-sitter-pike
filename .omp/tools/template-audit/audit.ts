#!/usr/bin/env bun

/**
 * Template audit tool
 * 
 * Checks project compliance with ai-project-template v0.6.0
 */

interface Check {
  name: string;
  passed: boolean;
  message?: string;
}

const REQUIRED_FILES = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  '.template-version',
  '.architecture.yml',
  '.github/CODEOWNERS',
  '.github/SECURITY.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.omp/settings.json',
];

const REQUIRED_DIRS = [
  '.omp/agents',
  '.omp/rules',
  '.omp/skills',
  '.omp/hooks',
  '.omp/tools',
  '.github/workflows',
  'docs/decisions',
];

const REQUIRED_WORKFLOWS = [
  'ci.yml',
  'commit-lint.yml',
  'changelog-check.yml',
  'blob-size-policy.yml',
  'branch-cleanup.yml',
];

function checkFile(file: string): boolean {
  try {
    Deno.statSync(file);
    return true;
  } catch {
    return false;
  }
}

function checkDir(dir: string): boolean {
  return checkFile(dir) && Deno.statSync(dir).isDirectory();
}

function checkWorkflow(workflow: string): boolean {
  return checkFile(`.github/workflows/${workflow}`);
}

function checkVersion(): { valid: boolean; version: string | null } {
  try {
    const version = Deno.readTextFileSync('.template-version').trim();
    const valid = /^\d+\.\d+\.\d+$/.test(version);
    return { valid, version };
  } catch {
    return { valid: false, version: null };
  }
}

function audit(check?: string): Check[] {
  const checks: Check[] = [];
  
  // Files check
  if (!check || check === 'files' || check === 'all') {
    for (const file of REQUIRED_FILES) {
      const exists = checkFile(file);
      checks.push({
        name: `File: ${file}`,
        passed: exists,
        message: exists ? undefined : `Missing required file: ${file}`,
      });
    }
  }
  
  // Directories check
  if (!check || check === 'structure' || check === 'all') {
    for (const dir of REQUIRED_DIRS) {
      const exists = checkDir(dir);
      checks.push({
        name: `Dir: ${dir}`,
        passed: exists,
        message: exists ? undefined : `Missing required directory: ${dir}`,
      });
    }
  }
  
  // Workflows check
  if (!check || check === 'workflows' || check === 'all') {
    for (const workflow of REQUIRED_WORKFLOWS) {
      const exists = checkWorkflow(workflow);
      checks.push({
        name: `Workflow: ${workflow}`,
        passed: exists,
        message: exists ? undefined : `Missing required workflow: ${workflow}`,
      });
    }
  }
  
  // Version check
  if (!check || check === 'version' || check === 'all') {
    const { valid, version } = checkVersion();
    checks.push({
      name: 'Template version',
      passed: valid,
      message: valid ? undefined : `Invalid .template-version: ${version ?? 'missing'}`,
    });
  }
  
  return checks;
}

function main() {
  const checkArg = Deno.args.find(a => a.startsWith('--check='))?.split('=')[1];
  
  const checks = audit(checkArg);
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed);
  
  console.log(`\n📋 Template Audit (ai-project-template v0.6.0)\n`);
  console.log(`Checks: ${passed}/${checks.length} passed\n`);
  
  if (failed.length > 0) {
    console.log('❌ Failed checks:\n');
    for (const check of failed) {
      console.log(`  - ${check.name}`);
      if (check.message) console.log(`    ${check.message}`);
    }
    console.log('');
    Deno.exit(1);
  }
  
  console.log('✅ All checks passed!\n');
}

main();