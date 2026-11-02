import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {checkPublicFiles} from './public-content-check.mjs';
test('publication scan rejects staged credentials even after working copy is cleaned', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sovrad-scan-'));
  try {
    execFileSync('git', ['init', '-q'], {cwd: root});
    writeFileSync(path.join(root, 'README.md'), 'Synthetic public example');
    assert.equal(checkPublicFiles(root).violations.length, 0);
    writeFileSync(path.join(root, 'README.md'), 'sk-' + 'a'.repeat(30));
    execFileSync('git', ['add', 'README.md'], {cwd: root});
    writeFileSync(path.join(root, 'README.md'), 'Synthetic public example');
    assert.ok(checkPublicFiles(root).violations.some(v => v.includes('staged credential')));
  } finally { rmSync(root, {recursive: true, force: true}); }
});
test('publication scan rejects private paths, database files and unexpected exports', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sovrad-scan-'));
  try {
    mkdirSync(path.join(root, 'docs'));
    writeFileSync(path.join(root, '.env.example'), 'OPENAI_API_KEY=');
    assert.deepEqual(checkPublicFiles(root).violations, []);
    writeFileSync(path.join(root, '.env.local'), 'DO_NOT_PUBLISH=1');
    writeFileSync(path.join(root, 'docs', 'local.sqlite-wal'), 'synthetic');
    writeFileSync(path.join(root, 'private-export.json'), '{}');
    const result = checkPublicFiles(root).violations;
    for (const name of ['.env.local', 'local.sqlite-wal', 'private-export.json']) assert.ok(result.some(v => v.includes(name)));
  } finally { rmSync(root, {recursive: true, force: true}); }
});


test('staged scanning follows the same repository through an equivalent root path', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sovrad-scan-alias-'));
  try {
    execFileSync('git', ['init', '-q'], {cwd: root});
    writeFileSync(path.join(root, 'README.md'), 'sk-' + 'a'.repeat(30));
    execFileSync('git', ['add', 'README.md'], {cwd: root});
    writeFileSync(path.join(root, 'README.md'), 'Synthetic public example');
    // Keep the dot spelling: Git canonicalizes it, as it does Windows 8.3 aliases.
    const equivalentRoot = root + path.sep + '.';
    assert.ok(checkPublicFiles(equivalentRoot).violations.some(v => v.includes('staged credential')));
  } finally { rmSync(root, {recursive: true, force: true}); }
});
