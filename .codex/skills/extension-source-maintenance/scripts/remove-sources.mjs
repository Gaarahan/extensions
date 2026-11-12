#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { validate, parseFields, stringField, lengthField, assetMatches } from './curated-repo.mjs';
const packages = [];
let root = process.cwd();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--package') { if (!args[i + 1]) throw new Error('--package requires an exact package'); packages.push(args[++i]); }
  else if (args[i] === '--root') { if (!args[i + 1]) throw new Error('--root requires a directory'); root = args[++i]; }
  else throw new Error(`unknown argument: ${args[i]}`);
}
if (!packages.length || new Set(packages).size !== packages.length) throw new Error('provide unique exact --package values');
// Complete validation and construct every replacement before changing any file.
// Permit a structurally valid upstream snapshot before language cleanup; final validation enforces policy.
const current = validate(root, { enforceLanguagePolicy: false });
const selected = packages.map(pkg => {
  const matches = current.extensions.filter(e => e.packageName === pkg);
  if (matches.length !== 1) throw new Error(`${pkg}: expected exactly one entry, found ${matches.length}`);
  return matches[0];
});
const removed = new Set(packages);
const urls = new Set(selected.map(e => e.resources.apkUrl));
const replacements = {};
const json = value => `${JSON.stringify(value, null, 2)}\n`;
current.index.extensionList.extensions = current.extensions.filter(e => !removed.has(e.packageName));
replacements['index.json'] = json(current.index);
replacements['index.pb'] = gzipSync(Buffer.concat(current.fields.map(f => {
  if (f.fieldNumber !== 101 || f.wireType !== 2) return f.raw;
  return lengthField(101, Buffer.concat(parseFields(f.payload).filter(e => e.fieldNumber !== 1 || e.wireType !== 2 || !removed.has(stringField(e.payload, 2))).map(e => e.raw)));
})), { level: 9 });
// Remove only the exact link element, not other links sharing its HTML line.
replacements['index.html'] = current.html.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi, (tag, url) => urls.has(url.replaceAll('&amp;', '&')) ? '' : tag);
const blacklist = JSON.parse(readFileSync(join(root, 'config/extension-blacklist.json')));
blacklist.packages = [...new Set([...blacklist.packages, ...packages])].sort();
replacements['config/extension-blacklist.json'] = json(blacklist);
if (current.manifest) replacements['release-assets.json'] = json(Object.fromEntries(Object.entries(current.manifest).filter(([pkg]) => !removed.has(pkg))));
const deletions = [];
for (const dir of ['apk', 'jar', 'icon']) {
  if (!existsSync(join(root, dir))) continue;
  for (const name of readdirSync(join(root, dir))) if (packages.some(pkg => assetMatches(name, pkg))) deletions.push(`${dir}/${name}`);
}
function scrub(value) {
  if (Array.isArray(value)) return value.filter(v => !(typeof v === 'string' && removed.has(v)) && !(v && typeof v === 'object' && removed.has(v.packageName))).map(scrub);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !removed.has(key)).map(([key, v]) => [key, scrub(v)]));
  return value;
}
if (existsSync(join(root, 'reports'))) for (const name of readdirSync(join(root, 'reports')).filter(n => n.endsWith('.json'))) replacements[`reports/${name}`] = json(scrub(JSON.parse(readFileSync(join(root, 'reports', name)))));
validate(root, { ...replacements, ignoredAssets: deletions });
// Stage all writes first. Roll back ordinary filesystem failures during commit.
const originals = new Map([...Object.keys(replacements), ...deletions].map(path => [path, readFileSync(join(root, path))]));
const staged = [];
try {
  for (const [path, bytes] of Object.entries(replacements)) {
    const temp = `${join(root, path)}.curated-${process.pid}.tmp`;
    writeFileSync(temp, bytes, { flag: 'wx' }); staged.push([temp, join(root, path)]);
  }
} catch (error) { for (const [temp] of staged) unlinkSync(temp); throw error; }
try {
  for (const [temp, path] of staged) renameSync(temp, path);
  for (const path of deletions) unlinkSync(join(root, path));
} catch (error) {
  for (const [path, bytes] of originals) writeFileSync(join(root, path), bytes);
  for (const [temp] of staged) if (existsSync(temp)) unlinkSync(temp);
  throw error;
}
for (const e of selected) console.log(`Removed ${e.name} (${e.packageName})`);
