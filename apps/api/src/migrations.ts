import type Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export function backupPath(directory: string): string {
  const backups = path.join(directory, 'backups');
  mkdirSync(backups, {recursive: true, mode: 0o700});
  return path.join(backups, `snapshot-${randomUUID()}.sqlite`);
}

export function migrate(db: Database.Database, directory: string, existing: boolean): void {
  const version = db.pragma('user_version', {simple: true}) as number;
  if (version > 3) throw new Error('Database is newer than this Sovrad version');
  if (version === 3) return;
  // VACUUM INTO is SQLite's consistent snapshot API and includes committed WAL data.
  if (existing) db.prepare('VACUUM INTO ?').run(backupPath(directory));
  db.transaction(() => {
    if (version < 1) db.exec(`CREATE TABLE ai_spending (
      id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('pending','settled','unknown')),
      reserved_micros INTEGER NOT NULL CHECK(reserved_micros>=0),
      input_tokens INTEGER NOT NULL CHECK(input_tokens>=0),
      actual_micros INTEGER NOT NULL CHECK(actual_micros>=0), created_at TEXT NOT NULL
    );`);
    if (version < 2) db.exec(`CREATE TABLE implementation_tasks(id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id),state TEXT NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE implementation_events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT NOT NULL REFERENCES implementation_tasks(id),kind TEXT NOT NULL,time TEXT NOT NULL,detail TEXT NOT NULL);`);
    db.exec(`CREATE TABLE imported_snapshots(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
      CREATE TABLE import_quarantines(id TEXT PRIMARY KEY,time TEXT NOT NULL,file_hash TEXT NOT NULL,reason TEXT NOT NULL);`);
    db.pragma('user_version = 3');
  }).immediate();
}
