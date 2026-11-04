import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {Storage} from './storage.ts';

function fixture(t, transformDirectory = directory => directory) {
  const createdDirectory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-budget-'));
  const directory = transformDirectory(createdDirectory);
  const storage = new Storage(directory);
  t.after(() => { try { storage.close(); } catch {} rmSync(createdDirectory, {recursive: true, force: true}); });
  return {storage, directory};
}

function isStrictFilesystemDescendant(directory, candidate) {
  const relative = path.relative(realpathSync.native(directory), realpathSync.native(candidate));
  return relative !== '' && relative !== '..'
    && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

test('budget atomically reserves worst-case cost and survives restart', t => {
  const {storage, directory} = fixture(t);
  assert.equal(storage.budget.status().limitMicros, 5_000_000);
  const id = storage.budget.reserve(1000);
  assert.equal(storage.budget.status().reservedMicros, 20_500);
  const other = new Storage(directory);
  assert.throws(() => other.budget.reserve(1000), /paused|pending/i);
  other.close();
  storage.budget.settle(id, {input_tokens: 1000, output_tokens: 100});
  storage.close();
  const reopened = new Storage(directory);
  try {
    assert.equal(reopened.budget.status().spentMicros, 3700);
    assert.equal(reopened.budget.status().remainingMicros, 4_996_300);
    assert.equal(reopened.budget.status().reservedMicros, 0);
    assert.throws(() => reopened.budget.settle(id, {input_tokens: 1000, output_tokens: 100}), /resolved/i);
  } finally { reopened.close(); }
});

test('unknown charges remain reserved and block paid calls across restarts', t => {
  const {storage, directory} = fixture(t);
  const id = storage.budget.reserve(500);
  storage.budget.unknown(id);
  assert.equal(storage.budget.status().paused, true);
  storage.close();
  const reopened = new Storage(directory);
  try {
    assert.equal(reopened.budget.status().reservedMicros, 19_250);
    assert.throws(() => reopened.budget.reserve(500), /paused/i);
  } finally { reopened.close(); }
});

test('invalid usage and token counts fail closed; total cannot exceed five dollars', t => {
  const {storage, directory} = fixture(t);
  for (const tokens of [-1, 1.1, NaN, 8193]) assert.throws(() => storage.budget.reserve(tokens));
  const id = storage.budget.reserve(1000);
  assert.throws(() => storage.budget.settle(id, {input_tokens: 1001, output_tokens: 100}), /usage/i);
  assert.equal(storage.budget.status().reservedMicros, 20_500);
  storage.budget.settle(id, {input_tokens: 1000, output_tokens: 1500});
  const db = new Database(path.join(directory, 'sovrad.sqlite'));
  db.prepare("UPDATE ai_spending SET actual_micros=4990000 WHERE id=?").run(id);
  db.close();
  assert.throws(() => storage.budget.reserve(1000), /budget/i);
  assert.equal(storage.budget.status().remainingMicros, 10_000);
});

test('online SQLite backup restores original workflow and budget without resetting either', async t => {
  const {storage, directory} = fixture(t);
  const id = storage.budget.reserve(100);
  storage.budget.settle(id, {input_tokens: 100, output_tokens: 10});
  const backup = await storage.backup();
  assert.ok(isStrictFilesystemDescendant(directory, backup));
  const restored = new Database(backup, {readonly: true});
  try {
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(restored.prepare('SELECT count(*) AS n FROM workflow_revisions').get().n, 1);
    assert.equal(restored.prepare('SELECT actual_micros FROM ai_spending').get().actual_micros, 370);
  } finally { restored.close(); }
});

test('online SQLite backup stays inside an alternate-case Windows private directory', {
  skip: process.platform !== 'win32',
}, async t => {
  const {storage, directory} = fixture(t, directory =>
    path.join(path.dirname(directory), path.basename(directory).toUpperCase()));
  assert.ok(existsSync(directory));
  const backup = await storage.backup();
  assert.ok(existsSync(backup));
  assert.ok(isStrictFilesystemDescendant(directory, backup));
});

test('backup containment excludes the private directory itself, its parent and a sibling with the same prefix', t => {
  const {directory} = fixture(t);
  const sibling = mkdtempSync(directory + '-sibling-');
  t.after(() => rmSync(sibling, {recursive: true, force: true}));
  assert.equal(isStrictFilesystemDescendant(directory, directory), false);
  assert.equal(isStrictFilesystemDescendant(directory, path.dirname(directory)), false);
  assert.equal(isStrictFilesystemDescendant(directory, sibling), false);
});
