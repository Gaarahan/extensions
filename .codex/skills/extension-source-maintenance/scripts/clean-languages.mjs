#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validate, readLanguagePolicy, matchesLanguagePolicy } from './curated-repo.mjs';
let root = process.cwd(), dryRun = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--root' && args[i + 1]) root = resolve(args[++i]);
  else if (args[i] === '--dry-run') dryRun = true;
  else throw new Error(`unknown or incomplete argument: ${args[i]}`);
}
const policy = readLanguagePolicy(root);
// Upstream must first be staged consistently with the permanent blacklist applied.
const current = validate(root, { enforceLanguagePolicy: false });
const packages = current.extensions.filter(e => !matchesLanguagePolicy(e, policy)).map(e => e.packageName);
if (dryRun) {
  console.log(JSON.stringify({ remove: packages, keep: current.extensions.length - packages.length }, null, 2));
} else {
  if (packages.length) {
    execFileSync(process.execPath, [fileURLToPath(new URL('./remove-sources.mjs', import.meta.url)), '--root', root, ...packages.flatMap(pkg => ['--package', pkg])], { stdio: 'inherit' });
  }
  const result = validate(root);
  console.log(`Language cleanup complete: ${packages.length} packages removed and blacklisted; ${result.extensions.length} retained.`);
}
