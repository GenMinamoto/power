import type { Database, SqlJsStatic } from 'sql.js';
import type { SqlDb, SqlParam, SqlStatement } from '../server/dbCore.js';

// sql.js（ブラウザで動く SQLite）を、PC 版と同じ SqlDb の形で使えるようにする。
// sql.js の export() は開いている文をすべて閉じるため、文は呼び出しごとに作って閉じる。

type Bind = (string | number | null | Uint8Array)[];

function toBind(params: SqlParam[]): Bind {
  return params.map((p) => (typeof p === 'bigint' ? Number(p) : p === undefined ? null : p));
}

export class SqlJsDb implements SqlDb {
  private db: Database;

  constructor(
    private SQL: SqlJsStatic,
    bytes?: Uint8Array | null,
  ) {
    this.db = this.open(bytes);
  }

  private open(bytes?: Uint8Array | null): Database {
    const db = bytes ? new this.SQL.Database(bytes) : new this.SQL.Database();
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): SqlStatement {
    const withStmt = <T>(params: SqlParam[], fn: (s: ReturnType<Database['prepare']>) => T): T => {
      const stmt = this.db.prepare(sql);
      try {
        stmt.bind(toBind(params));
        return fn(stmt);
      } finally {
        stmt.free();
      }
    };
    return {
      get: (...params) => withStmt(params, (s) => (s.step() ? s.getAsObject() : undefined)),
      all: (...params) =>
        withStmt(params, (s) => {
          const rows: unknown[] = [];
          while (s.step()) rows.push(s.getAsObject());
          return rows;
        }),
      run: (...params) => {
        withStmt(params, (s) => {
          while (s.step()) {
            // 結果行は使わない
          }
        });
        const changes = this.db.getRowsModified();
        const r = this.db.exec('SELECT last_insert_rowid() AS id');
        const lastInsertRowid = Number(r[0]?.values[0]?.[0] ?? 0);
        return { changes, lastInsertRowid };
      },
    };
  }

  /** DB 全体をバイト列にする（保存用）。export 後は PRAGMA が初期値に戻るため設定し直す */
  export(): Uint8Array {
    const bytes = this.db.export();
    this.db.exec('PRAGMA foreign_keys = ON');
    return bytes;
  }

  /** 中身を丸ごと差し替える（バックアップからの復元） */
  replace(bytes: Uint8Array): void {
    const next = this.open(bytes);
    this.db.close();
    this.db = next;
  }

  close(): void {
    this.db.close();
  }
}
