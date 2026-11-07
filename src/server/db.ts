import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.js';

export type Db = DatabaseSync;

/** 現在時刻を「+09:00」のようなローカルのオフセット付き ISO 8601 で返す */
export function nowIso(now: Date = new Date()): string {
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`
  );
}

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 3000');
  migrate(db);
  ensureProfile(db);
  return db;
}

export function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row.user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

function ensureProfile(db: Db): void {
  db.prepare('INSERT OR IGNORE INTO profile (id, updated_at) VALUES (1, ?)').run(nowIso());
}

/** fn を 1 トランザクションで実行。例外時はロールバック */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
