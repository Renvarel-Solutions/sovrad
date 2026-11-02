import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {CALCULATOR_PROJECT, CALCULATOR_WORKFLOW} from '@renvarel/architect-core';
import {Storage} from './storage.ts';
import {buildApp} from './server.ts';

// Explicit historical DDL: v0 predates spending, v1 adds it, v2 adds tasks,
// and v3 adds imports. No fixture depends on Git history being available.
const baseline = `
  CREATE TABLE projects(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  CREATE TABLE workflows(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),revision INTEGER NOT NULL,payload TEXT NOT NULL);
  CREATE TABLE proposals(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id),status TEXT NOT NULL CHECK(status IN ('draft','approved','rejected')),payload TEXT NOT NULL);
  CREATE TABLE audit_events(id TEXT PRIMARY KEY,time TEXT NOT NULL,action TEXT NOT NULL,workflow_id TEXT NOT NULL,base_revision INTEGER NOT NULL,resulting_revision INTEGER,proposal_id TEXT NOT NULL,specification_json TEXT NOT NULL);
  CREATE TABLE ai_daily_usage(day TEXT PRIMARY KEY,requests INTEGER NOT NULL CHECK(requests >= 0));
  CREATE TABLE workflow_revisions(workflow_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workflow_id,revision));
`;
const spending = `CREATE TABLE ai_spending(
  id TEXT PRIMARY KEY,state TEXT NOT NULL CHECK(state IN ('pending','settled','unknown')),
  reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),input_tokens INTEGER NOT NULL CHECK(input_tokens>=0),
  actual_micros INTEGER NOT NULL CHECK(actual_micros>=0),created_at TEXT NOT NULL);`;
const tasks = `
  CREATE TABLE implementation_tasks(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id),state TEXT NOT NULL,payload TEXT NOT NULL);
  CREATE TABLE implementation_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES implementation_tasks(id),kind TEXT NOT NULL,time TEXT NOT NULL,detail TEXT NOT NULL);
`;
const imports = `
  CREATE TABLE imported_snapshots(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
  CREATE TABLE import_quarantines(id TEXT PRIMARY KEY,time TEXT NOT NULL,file_hash TEXT NOT NULL,reason TEXT NOT NULL);
`;
const day = new Date().toISOString().slice(0, 10);
const time = '2026-01-01T00:00:00.000Z';
const legacy = {...CALCULATOR_WORKFLOW, id: 'fictional-legacy-workflow', projectId: 'fictional-legacy-project', revision: 2};

function temporary(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-migration-'));
  const cleanup = [];
  t.after(async () => {
    for (const close of cleanup.reverse()) await close();
    rmSync(directory, {recursive: true, force: true});
  });
  return {directory, cleanup};
}

function snapshot(db) {
  const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name").all();
  const tables = schema.filter(row => row.type === 'table');
  const rows = Object.fromEntries(tables.map(({name}) => [name,
    db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all(),
  ]));
  return {version: db.pragma('user_version', {simple: true}), schema, rows};
}

function historical(t, version) {
  const {directory, cleanup} = temporary(t);
  const filename = path.join(directory, 'sovrad.sqlite');
  const db = new Database(filename);
  cleanup.push(() => { if (db.open) db.close(); });
  db.pragma('journal_mode = WAL');
  db.pragma('wal_autocheckpoint = 0');
  db.exec(baseline);
  if (version >= 1) db.exec(spending);
  if (version >= 2) db.exec(tasks);
  if (version >= 3) db.exec(imports);
  db.pragma(`user_version = ${version}`);
  db.prepare('INSERT INTO projects VALUES (?,?)').run(legacy.projectId, JSON.stringify({...CALCULATOR_PROJECT, id: legacy.projectId}));
  db.prepare('INSERT INTO workflows VALUES (?,?,?,?)').run(legacy.id, legacy.projectId, 2, JSON.stringify(legacy));
  db.prepare('INSERT INTO workflow_revisions VALUES (?,?,?)').run(legacy.id, 1, JSON.stringify({...legacy, revision: 1}));
  db.pragma('wal_checkpoint(TRUNCATE)');
  const mainHash = createHash('sha256').update(readFileSync(filename)).digest('hex');
  // All rows below live in WAL while the original handle remains open.
  db.prepare('INSERT INTO ai_daily_usage VALUES (?,7)').run(day);
  db.prepare('INSERT INTO proposals VALUES (?,?,?,?)').run('fictional-proposal', legacy.id, 'approved', '{"synthetic":true}');
  db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').run('fictional-receipt', time, 'approve', legacy.id, 1, 2, 'fictional-proposal', JSON.stringify(legacy));
  if (version >= 1) {
    const insert = db.prepare('INSERT INTO ai_spending VALUES (?,?,?,?,?,?)');
    insert.run('settled-charge', 'settled', 20_500, 1000, 3700, time);
    insert.run('pending-charge', 'pending', 19_250, 500, 0, time);
    insert.run('unknown-charge', 'unknown', 18_250, 100, 0, time);
  }
  if (version >= 2) {
    db.prepare('INSERT INTO implementation_tasks VALUES (?,?,?,?)').run('fictional-task', legacy.id, 'cancelled', '{"synthetic":true}');
    db.prepare('INSERT INTO implementation_events(task_id,kind,time,detail) VALUES (?,?,?,?)').run('fictional-task', 'cancelled', time, 'Synthetic receipt');
  }
  if (version >= 3) {
    db.prepare('INSERT INTO imported_snapshots VALUES (?,?)').run('fictional-snapshot', '{"synthetic":true}');
    db.prepare('INSERT INTO import_quarantines VALUES (?,?,?,?)').run('fictional-quarantine', time, 'a'.repeat(64), 'Synthetic refusal');
  }
  assert.equal(createHash('sha256').update(readFileSync(filename)).digest('hex'), mainHash, 'fixture rows must not already be checkpointed');
  assert.ok(statSync(filename + '-wal').size > 32, 'fixture must contain committed WAL frames');
  return {db, directory, cleanup, before: snapshot(db)};
}

for (const version of [0, 1, 2, 3]) {
  test(`schema v${version} preserves historical WAL rows and backs up before bootstrap or history backfill`, t => {
    const {db, directory, cleanup, before} = historical(t, version);
    const storage = new Storage(directory);
    cleanup.push(() => storage.close());
    if (version < 3) {
      const backups = readdirSync(path.join(directory, 'backups'));
      assert.equal(backups.length, 1);
      const backup = new Database(path.join(directory, 'backups', backups[0]), {readonly: true});
      try {
        assert.equal(backup.pragma('integrity_check', {simple: true}), 'ok');
        assert.deepEqual(snapshot(backup), before, 'backup must match the exact pre-bootstrap schema and data, including WAL');
      } finally { backup.close(); }
    } else {
      assert.ok(!readdirSync(directory).includes('backups'), 'current schema needs no migration backup');
    }
    assert.equal(db.pragma('user_version', {simple: true}), 3);
    for (const [table, rows] of Object.entries(before.rows)) {
      if (table === 'projects' || table === 'workflows' || table === 'workflow_revisions') continue;
      assert.deepEqual(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), rows, table);
    }
    assert.deepEqual(storage.projects().find(project => project.id === legacy.projectId), {...CALCULATOR_PROJECT, id: legacy.projectId});
    assert.deepEqual(storage.workflow(legacy.id), legacy);
    assert.deepEqual(storage.history(legacy.id), [
      {revision: 1, workflow: {...legacy, revision: 1}},
      {revision: 2, workflow: legacy},
    ], 'existing history must be retained and the missing current snapshot backfilled after backup');
    assert.equal(storage.budget.status().dailyAttempts, 7);
    assert.equal(storage.budget.status().spentMicros, version === 0 ? 0 : 3700);
    assert.equal(storage.budget.status().reservedMicros, version === 0 ? 0 : 37_500);
    assert.equal(storage.budget.status().paused, version !== 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM ai_spending').get().n, version === 0 ? 0 : 3);
  });
}

test('newer schema is rejected without changing source bytes, schema, data or journal mode', t => {
  const {directory, cleanup} = temporary(t);
  const filename = path.join(directory, 'sovrad.sqlite');
  const db = new Database(filename);
  cleanup.push(() => db.close());
  db.exec("CREATE TABLE future_only(id TEXT PRIMARY KEY,value TEXT); INSERT INTO future_only VALUES ('fictional','preserve'); PRAGMA user_version=4;");
  const before = snapshot(db);
  const hash = createHash('sha256').update(readFileSync(filename)).digest('hex');
  // Capture the rejected handle only for cleanup if the broken constructor leaks it.
  const original = Database.prototype.pragma;
  let rejected;
  Database.prototype.pragma = function (...args) { if (this !== db) rejected = this; return original.apply(this, args); };
  try {
    assert.throws(() => new Storage(directory), /newer/i);
    assert.equal(createHash('sha256').update(readFileSync(filename)).digest('hex'), hash);
    assert.equal(db.pragma('journal_mode', {simple: true}), 'delete');
    assert.deepEqual(snapshot(db), before);
    assert.deepEqual(readdirSync(directory).sort(), ['sovrad.sqlite']);
    assert.equal(rejected?.open, false, 'rejected database handle must be closed');
  } finally {
    Database.prototype.pragma = original;
    if (rejected?.open) rejected.close();
  }
});

test('initialization closes its database handle when bootstrap fails', t => {
  const {directory} = temporary(t);
  const original = Database.prototype.exec;
  let rejected;
  Database.prototype.exec = function () { rejected = this; throw new Error('Synthetic bootstrap failure'); };
  try {
    assert.throws(() => new Storage(directory), /Synthetic bootstrap failure/);
    assert.ok(rejected, 'must reach database bootstrap');
    assert.equal(rejected.open, false, 'failed initialization must close its handle');
  } finally {
    Database.prototype.exec = original;
    if (rejected?.open) rejected.close();
  }
});

test('unclean exit retains unknown charge and blocks the next fake paid request after reopen', async t => {
  const {directory, cleanup} = temporary(t);
  const childEnv = Object.fromEntries(['SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []));
  const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import {Storage} from ${JSON.stringify(new URL('./storage.ts', import.meta.url).href)};
    const storage = new Storage(process.argv[1]);
    storage.reserveAIRequest(new Date().toISOString().slice(0, 10), 10);
    const id = storage.budget.reserve(1000);
    storage.budget.unknown(id);
    process.exit(29);
  `, directory], {env: childEnv, encoding: 'utf8', windowsHide: true});
  assert.equal(child.status, 29, child.stderr);
  const storage = new Storage(directory);
  let providerCalls = 0;
  const app = buildApp(storage, {ai: {enabled: true, apiKey: 'synthetic-migration-key', hardLimitConfirmed: true,
    fetch: async () => { providerCalls++; throw new Error('Paid transport must remain blocked'); },
  }});
  cleanup.push(() => app.close());
  const status = storage.budget.status();
  assert.equal(status.paused, true);
  assert.equal(status.reservedMicros, 20_500);
  assert.equal(status.dailyAttempts, 1);
  const response = await app.inject({method: 'POST', url: '/api/ai/proposal',
    headers: {host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', 'x-sovrad-action': '1'},
    payload: {workflowId: CALCULATOR_WORKFLOW.id, stepId: 'number-a', baseRevision: 1, text: 'Accept whole numbers', sendToAI: true},
  });
  assert.equal(response.statusCode, 429, response.body);
  assert.match(response.json().error, /paused/i);
  assert.equal(providerCalls, 0);
  assert.equal(storage.budget.status().dailyAttempts, 1);
});
