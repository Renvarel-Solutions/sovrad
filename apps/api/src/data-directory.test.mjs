import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateDataDirectory } from './data-directory.ts';

test('private storage rejects source root, descendants, ancestors and relative paths', () => {
  // Hosted Windows temp paths may use 8.3 aliases; the validator returns canonical paths.
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'sovrad-path-')));
  try {
    const source = path.join(temp, 'source');
    mkdirSync(source);
    for (const unsafe of [source, path.join(source, 'nested', 'data'), temp, '.private']) {
      assert.throws(() => validateDataDirectory(unsafe, source), /outside|absolute/);
    }
    assert.equal(validateDataDirectory(path.join(temp, 'private'), source), path.join(temp, 'private'));
    // A textual prefix is not a parent directory.
    assert.equal(validateDataDirectory(source + '-data', source), source + '-data');
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('a junction into source cannot bypass storage validation', () => {
  const temp = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), 'sovrad-junction-')));
  try {
    const source = path.join(temp, 'source');
    const alias = path.join(temp, 'alias');
    mkdirSync(source);
    symlinkSync(source, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => validateDataDirectory(path.join(alias, 'new-data'), source), /outside/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
