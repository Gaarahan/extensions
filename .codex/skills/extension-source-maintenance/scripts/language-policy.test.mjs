import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { matchesLanguagePolicy, readLanguagePolicy, validate } from './curated-repo.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const policy = readLanguagePolicy(root);
const entry = languages => ({ sources: languages.map(language => ({ language })) });
test('keep all, English and Chinese variants; reject other languages', () => {
  for (const lang of ['all', 'en', 'en-US', 'zh', 'zh-Hans', 'zh-Hant', 'zh-CN', 'zh-TW', 'zh-HK', 'ZH-tw']) assert(matchesLanguagePolicy(entry([lang]), policy), lang);
  for (const lang of ['ja', 'ko', 'fr', 'ru', 'pt-BR', '', 'all-other', 'english', 'zho']) assert(!matchesLanguagePolicy(entry([lang]), policy), lang);
});
test('retain complete multilingual packages without altering source records', () => {
  const value = entry(['ja', 'en', 'fr']);
  const original = structuredClone(value);
  assert(matchesLanguagePolicy(value, policy));
  assert.deepEqual(value, original);
  assert(!matchesLanguagePolicy(entry(['ja', 'fr']), policy));
  assert(!matchesLanguagePolicy({}, policy));
});
test('current repository meets language and cross-index invariants', () => {
  const state = validate(root);
  assert(state.extensions.every(e => matchesLanguagePolicy(e, policy)));
  for (const slug of ['hentaiimage', 'doujiva']) {
    const pkg = `eu.kanade.tachiyomi.extension.all.${slug}`;
    assert(state.blacklist.has(pkg));
    assert(!state.extensions.some(e => e.packageName === pkg));
  }
});
function snapshot(dir) {
  const out = {};
  function visit(current, relative = '') {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, item.name), rel = join(relative, item.name);
      if (item.isDirectory()) visit(path, rel);
      else out[rel] = createHash('sha256').update(readFileSync(path)).digest('hex');
    }
  }
  visit(dir);
  return out;
}
test('invalid removals are non-mutating; valid removal preserves retained packages', () => {
  const temp = mkdtempSync(join(tmpdir(), 'curated-repo-test-'));
  const target = join(temp, 'repo');
  cpSync(root, target, { recursive: true, filter: path => !path.includes(`${root}.git`) && !path.endsWith('/.git') });
  try {
    const before = snapshot(target);
    const cleanup = resolve(root, '.codex/skills/extension-source-maintenance/scripts/clean-languages.mjs');
    for (const args of [['--dry-run'], []]) {
      const result = spawnSync(process.execPath, [cleanup, '--root', target, ...args]);
      assert.equal(result.status, 0, result.stderr.toString());
      assert.deepEqual(snapshot(target), before);
    }
    const selected = validate(target).extensions[0].packageName;
    const script = resolve(root, '.codex/skills/extension-source-maintenance/scripts/remove-sources.mjs');
    for (const args of [['--package', 'eu.kanade.tachiyomi.extension.en.nonexistent_test'], ['--package', selected, '--package', selected], ['--package'], ['--bad']]) {
      const result = spawnSync(process.execPath, [script, '--root', target, ...args]);
      assert.notEqual(result.status, 0);
      assert.deepEqual(snapshot(target), before);
    }
    const initial = validate(target).extensions;
    const result = spawnSync(process.execPath, [script, '--root', target, '--package', selected]);
    assert.equal(result.status, 0, result.stderr.toString());
    const final = validate(target);
    assert.deepEqual(final.extensions, initial.filter(e => e.packageName !== selected));
    assert(final.blacklist.has(selected));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
