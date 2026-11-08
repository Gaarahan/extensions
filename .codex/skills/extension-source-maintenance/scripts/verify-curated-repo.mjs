#!/usr/bin/env node
import { validate, packageStem, assetMatches } from './curated-repo.mjs';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
let root = process.cwd(), pkg;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--package') { pkg = args[++i]; if (!pkg) throw new Error('--package requires an exact package'); }
  else if (args[i] === '--root') { root = args[++i]; if (!root) throw new Error('--root requires a directory'); }
  else if (!args[i].startsWith('-')) root = args[i];
  else throw new Error(`unknown argument: ${args[i]}`);
}
const result = validate(root);
if (pkg) {
  packageStem(pkg);
  if (!result.blacklist.has(pkg) || result.extensions.some(e => e.packageName === pkg)) throw new Error(`package not removed/blacklisted: ${pkg}`);
}
console.log(`Verified ${result.extensions.length} packages: JSON/protobuf versions and resources, exact HTML links, blacklist, and local assets or release URL/manifest metadata. Remote availability and binary hashes require separate checks.`);
