import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gunzipSync } from 'node:zlib';
export function readVarint(buffer, start) {
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

export function encodeVarint(input) {
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

export function parseFields(buffer) {
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

export function stringField(message, fieldNumber) {
  const field = parseFields(message).find((item) => item.fieldNumber === fieldNumber && item.wireType === 2);
  return field?.payload.toString('utf8');
}

export function lengthField(fieldNumber, payload) {
  return Buffer.concat([encodeVarint(BigInt(fieldNumber << 3 | 2)), encodeVarint(payload.length), payload]);
}


export function packageStem(pkg) {
  if (!/^eu\.kanade\.tachiyomi\.extension\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/.test(pkg)) throw new Error(`invalid package: ${pkg}`);
  return `tachiyomi-${pkg.slice('eu.kanade.tachiyomi.extension.'.length)}`;
}
export function assetMatches(name, pkg) {
  const stem = packageStem(pkg);
  return name.startsWith(`${stem}-v`) || name === `${pkg}.png` || name === `${pkg}.webp`;
}
export function htmlLinks(html) {
  return [...html.matchAll(/href=["']([^"']+)["']/g)].map(m => m[1].replaceAll('&amp;', '&'));
}
export function validate(root, override = {}) {
  const get = name => override[name] ?? readFileSync(join(root, name));
  const index = JSON.parse(get('index.json'));
  const blacklist = new Set(JSON.parse(get('config/extension-blacklist.json')).packages);
  const extensions = index.extensionList?.extensions;
  if (!Array.isArray(extensions)) throw new Error('missing extensionList.extensions');
  const manifest = existsSync(join(root, 'release-assets.json')) || override['release-assets.json'] ? JSON.parse(get('release-assets.json')) : null;
  const fields = parseFields(gunzipSync(get('index.pb')));
  const lists = fields.filter(f => f.fieldNumber === 101 && f.wireType === 2);
  if (lists.length !== 1) throw new Error('expected one protobuf extension list');
  const pb = new Map();
  for (const f of parseFields(lists[0].payload).filter(f => f.fieldNumber === 1 && f.wireType === 2)) {
    const pkg = stringField(f.payload, 2);
    if (!pkg || pb.has(pkg)) throw new Error(`duplicate/missing protobuf package: ${pkg}`);
    pb.set(pkg, f.payload);
  }
  const html = get('index.html').toString();
  const links = htmlLinks(html);
  const apkLinks = links.filter(x => /\.apk(?:[?#]|$)/.test(x));
  const expected = new Set();
  const seen = new Set();
  for (const e of extensions) {
    const pkg = e.packageName;
    packageStem(pkg);
    if (seen.has(pkg) || blacklist.has(pkg)) throw new Error(`duplicate/blacklisted package: ${pkg}`);
    seen.add(pkg);
    const message = pb.get(pkg);
    if (!message) throw new Error(`missing protobuf package: ${pkg}`);
    const fs = parseFields(message);
    const resource = fs.find(f => f.fieldNumber === 3 && f.wireType === 2)?.payload;
    const code = fs.find(f => f.fieldNumber === 5 && f.wireType === 0);
    if (!resource || !code || readVarint(code.raw, 1).value.toString() !== String(e.versionCode) || stringField(message, 6) !== e.versionName || stringField(message, 4) !== e.extensionLib) throw new Error(`protobuf version mismatch: ${pkg}`);
    for (const [key, number] of [['apkUrl', 1], ['iconUrl', 2], ['jarUrl', 501]]) {
      if (stringField(resource, number) !== e.resources?.[key]) throw new Error(`protobuf resource mismatch: ${pkg} ${key}`);
    }
    for (const [key, suffix, dir] of [['apkUrl', 'apk', 'apk'], ['jarUrl', 'jar', 'jar']]) {
      const u = new URL(e.resources[key]);
      const filename = `${packageStem(pkg)}-v${e.versionName}.${suffix}`;
      if (basename(u.pathname) !== filename || u.search || u.hash || u.username || u.password) throw new Error(`unexpected asset URL: ${pkg} ${key}`);
      if (existsSync(join(root, dir))) {
        if (!existsSync(join(root, dir, filename))) throw new Error(`missing local ${dir}: ${pkg}`);
      } else {
        if (u.origin !== 'https://github.com' || !/^\/keiyoushi\/extensions\/releases\/download\/[^/]+\/[^/]+$/.test(u.pathname)) throw new Error(`unverified release URL shape: ${pkg}`);
        if (!manifest || !/^[0-9a-f]{64}$/.test(manifest[pkg] ?? '')) throw new Error(`missing release manifest hash: ${pkg}`);
      }
    }
    expected.add(e.resources.apkUrl);
    if (apkLinks.filter(x => x === e.resources.apkUrl).length !== 1) throw new Error(`missing/duplicate HTML APK URL: ${pkg}`);
  }
  if (pb.size !== seen.size) throw new Error('JSON/protobuf package sets differ');
  if (apkLinks.some(u => !expected.has(u))) throw new Error('unexpected HTML APK link');
  if (manifest && (Object.keys(manifest).length !== seen.size || Object.keys(manifest).some(p => !seen.has(p)))) throw new Error('release manifest package set differs');
  for (const dir of ['apk', 'jar', 'icon']) {
    if (!existsSync(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir))) {
      if (!(override.ignoredAssets ?? []).includes(`${dir}/${name}`) && [...blacklist].some(pkg => assetMatches(name, pkg))) throw new Error(`blacklisted local asset: ${dir}/${name}`);
    }
  }
  return { index, extensions, blacklist, manifest, fields, html };
}
