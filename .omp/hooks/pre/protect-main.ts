#!/usr/bin/env bun

/**
 * Pre-action hook: Protect main branch
 * 
 * Prevents direct pushes and force-pushes to main.
 */

import { git } from './utils.ts';

async function main() {
  const branch = await git.currentBranch();
  const isProtected = ['main', 'master'].includes(branch);
  
  if (isProtected) {
    const hasUpstream = await git.hasUpstream();
    
    if (!hasUpstream) {
      console.error('Error: Cannot push to protected branch without upstream');
      console.error('Set upstream with: git push -u origin ' + branch);
      Deno.exit(1);
    }
    
    // Check for force push
    const args = Deno.args;
    if (args.includes('--force') || args.includes('-f')) {
      console.error('Error: Force push is not allowed to protected branches');
      Deno.exit(1);
    }
  }
}

main();