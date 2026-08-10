#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const packages = [];
let root = process.cwd();
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--package') {
    if (!args[i + 1]) throw new Error('--package requires an exact package name');
    packages.push(args[++i]);
  } else if (args[i] === '--root') {
    if (!args[i + 1]) throw new Error('--root requires a directory');
    root = args[++i];
  } else {
    throw new Error(`unknown argument: ${args[i]}`);
  }
}
if (!packages.length) throw new Error('provide at least one --package');
if (new Set(packages).size !== packages.length) throw new Error('duplicate --package argument');

const indexPath = join(root, 'index.json');
const index = JSON.parse(readFileSync(indexPath, 'utf8'));
const extensions = index.extensionList?.extensions;
if (!Array.isArray(extensions)) throw new Error('index.json does not contain extensionList.extensions');

const selected = packages.map((packageName) => {
  const matches = extensions.filter((extension) => extension.packageName === packageName);
  if (matches.length !== 1) throw new Error(`${packageName}: expected exactly one index.json entry, found ${matches.length}`);
  return matches[0];
});
const packageSet = new Set(packages);

function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let offset = start;
  while (offset < buffer.length) {
    const byte = buffer[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
    if (shift > 70n) throw new Error('invalid protobuf varint');
  }
  throw new Error('truncated protobuf varint');
}

function encodeVarint(input) {
  let value = BigInt(input);
  const bytes = [];
  do {
    let byte = Number(value & 0x7fn);
    value >>= 7n;
    if (value) byte |= 0x80;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}

function parseFields(buffer) {
  const fields = [];
  let offset = 0;
  while (offset < buffer.length) {
    const start = offset;
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    let payload;
    if (wireType === 0) {
      offset = readVarint(buffer, offset).offset;
    } else if (wireType === 1) {
      offset += 8;
    } else if (wireType === 2) {
      const length = readVarint(buffer, offset);
      offset = length.offset;
      const end = offset + Number(length.value);
      if (end > buffer.length) throw new Error('truncated protobuf field');
      payload = buffer.subarray(offset, end);
      offset = end;
    } else if (wireType === 5) {
      offset += 4;
    } else {
      throw new Error(`unsupported protobuf wire type ${wireType}`);
    }
    if (offset > buffer.length) throw new Error('truncated protobuf field');
    fields.push({ fieldNumber, wireType, payload, raw: buffer.subarray(start, offset) });
  }
  return fields;
}

function stringField(message, fieldNumber) {
  const field = parseFields(message).find((item) => item.fieldNumber === fieldNumber && item.wireType === 2);
  return field?.payload.toString('utf8');
}

function lengthField(fieldNumber, payload) {
  return Buffer.concat([encodeVarint(BigInt(fieldNumber << 3 | 2)), encodeVarint(payload.length), payload]);
}

const protobufPath = join(root, 'index.pb');
const rootMessage = gunzipSync(readFileSync(protobufPath));
let protobufRemovals = 0;
const rebuiltRoot = parseFields(rootMessage).map((field) => {
  if (field.fieldNumber !== 101 || field.wireType !== 2) return field.raw;
  const extensionList = parseFields(field.payload);
  const kept = extensionList.filter((extensionField) => {
    if (extensionField.fieldNumber !== 1 || extensionField.wireType !== 2) return true;
    const packageName = stringField(extensionField.payload, 2);
    if (!packageSet.has(packageName)) return true;
    protobufRemovals += 1;
    return false;
  });
  return lengthField(101, Buffer.concat(kept.map((item) => item.raw)));
});
if (protobufRemovals !== packages.length) {
  throw new Error(`index.pb: expected ${packages.length} removals, found ${protobufRemovals}`);
}

index.extensionList.extensions = extensions.filter((extension) => !packageSet.has(extension.packageName));
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
writeFileSync(protobufPath, gzipSync(Buffer.concat(rebuiltRoot), { level: 9 }));

const blacklistPath = join(root, 'config', 'extension-blacklist.json');
const blacklist = JSON.parse(readFileSync(blacklistPath, 'utf8'));
blacklist.packages = [...new Set([...blacklist.packages, ...packages])].sort();
writeFileSync(blacklistPath, `${JSON.stringify(blacklist, null, 2)}\n`);

const assetNames = new Set();
for (const extension of selected) {
  for (const [resource, directory] of [['apkUrl', 'apk'], ['jarUrl', 'jar']]) {
    const url = extension.resources?.[resource];
    if (!url) throw new Error(`${extension.packageName}: missing ${resource}`);
    const name = basename(new URL(url).pathname);
    assetNames.add(name);
    const path = join(root, directory, name);
    if (!existsSync(path)) throw new Error(`${extension.packageName}: missing ${directory}/${name}`);
    unlinkSync(path);
  }
}

const htmlPath = join(root, 'index.html');
const htmlLines = readFileSync(htmlPath, 'utf8').split('\n');
const keptHtml = htmlLines.filter((line) => ![...assetNames].some((name) => line.includes(name)));
writeFileSync(htmlPath, keptHtml.join('\n'));

const iconPath = join(root, 'icon');
if (existsSync(iconPath)) {
  for (const extension of selected) {
    const slug = extension.packageName.split('.').at(-1);
    for (const name of readdirSync(iconPath)) {
      if (name === slug || name.startsWith(`${slug}.`) || name.includes(`.${slug}-`)) unlinkSync(join(iconPath, name));
    }
  }
}

function scrub(value) {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(typeof item === 'string' && packageSet.has(item)))
      .filter((item) => !(item && typeof item === 'object' && packageSet.has(item.packageName)))
      .map(scrub);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
  }
  return value;
}

const reportsPath = join(root, 'reports');
if (existsSync(reportsPath)) {
  for (const name of readdirSync(reportsPath).filter((item) => item.endsWith('.json'))) {
    const path = join(reportsPath, name);
    writeFileSync(path, `${JSON.stringify(scrub(JSON.parse(readFileSync(path, 'utf8'))), null, 2)}\n`);
  }
}

for (const extension of selected) console.log(`Removed ${extension.name} (${extension.packageName})`);
