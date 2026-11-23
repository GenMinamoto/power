import { MIGRATIONS } from './migrations.js';

// データベース操作の共通部分。Node.js 専用の機能を使わないので、
// PC 版（node:sqlite）とスマホ版（ブラウザ内の sql.js）の両方から使う。

export type SqlParam = string | number | bigint | null | Uint8Array;

export interface SqlStatement {
  get(...params: SqlParam[]): unknown;
  all(...params: SqlParam[]): unknown[];
  run(...params: SqlParam[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}

/** リポジトリが使う最小限の DB の形。node:sqlite の DatabaseSync はそのまま当てはまる */
export interface SqlDb {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
}

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

/** マイグレーションを当て、プロフィールの行を用意する */
export function initSchema(db: SqlDb): void {
  migrate(db);
  db.prepare('INSERT OR IGNORE INTO profile (id, updated_at) VALUES (1, ?)').run(nowIso());
}

export function migrate(db: SqlDb): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const current = row.user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** fn を 1 トランザクションで実行。例外時はロールバック */
export function transaction<T>(db: SqlDb, fn: () => T): T {
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
