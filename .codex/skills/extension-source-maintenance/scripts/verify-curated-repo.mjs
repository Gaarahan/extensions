#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const packageIndex = args.indexOf('--package');
const targetPackage = packageIndex === -1 ? null : args[packageIndex + 1];
const root = args.find((arg, index) => arg !== '--package' && index !== packageIndex + 1) ?? process.cwd();
if (packageIndex !== -1 && !targetPackage) throw new Error('--package requires an exact package name');
const index = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'));
const blacklist = new Set(JSON.parse(readFileSync(join(root, 'config/extension-blacklist.json'), 'utf8')).packages);
const extensions = index.extensionList?.extensions;
if (!Array.isArray(extensions)) throw new Error('index.json does not contain extensionList.extensions');

const packages = new Set();
const failures = [];
for (const extension of extensions) {
  if (!extension.packageName || packages.has(extension.packageName)) failures.push(`duplicate or missing package: ${extension.packageName}`);
  packages.add(extension.packageName);
  if (blacklist.has(extension.packageName)) failures.push(`blacklisted package in JSON: ${extension.packageName}`);
  for (const [field, directory] of [['apkUrl', 'apk'], ['jarUrl', 'jar']]) {
    const url = extension.resources?.[field];
    if (!url) failures.push(`${extension.packageName} has no ${field}`);
    else if (!existsSync(join(root, directory, new URL(url).pathname.split('/').pop()))) failures.push(`missing ${directory} asset for ${extension.packageName}`);
  }
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
if (targetPackage) {
  const slug = targetPackage.split('.').at(-1);
  if (!blacklist.has(targetPackage)) failures.push(`removed package is not blacklisted: ${targetPackage}`);
  if (packages.has(targetPackage)) failures.push(`removed package remains in JSON: ${targetPackage}`);
  for (const directory of ['apk', 'jar', 'icon']) {
    if (existsSync(join(root, directory)) && readdirSync(join(root, directory)).some((name) => name.includes(slug))) {
      failures.push(`removed package asset remains in ${directory}: ${slug}`);
    }
  }
  if (html.includes(`${slug}-v`)) failures.push(`removed package HTML link remains: ${slug}`);
}

if (!existsSync(join(root, 'index.pb'))) failures.push('missing index.pb');
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Verified ${extensions.length} published sources; JSON and asset coverage checks passed${targetPackage ? `, and ${targetPackage} is absent` : ''}.`);
