import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUP_KEEP, PRE_IMPORT_BACKUP_KEEP } from '../shared/constants.js';
import type { BackupInfo } from '../shared/types.js';
import type { Db } from './db.js';

const DAILY_RE = /^power-\d{8}(-\d+)?\.db$/;
const PRE_IMPORT_RE = /^power-\d{8}-\d{6}(-\d+)?-pre-import\.db$/;

function ymd(now: Date): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
}

function hms(now: Date): string {
  return [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
}

/** VACUUM INTO で使用中でも整合性のあるコピーを作る */
function vacuumInto(db: Db, path: string): void {
  db.exec(`VACUUM INTO '${path.replaceAll('\\', '/').replaceAll("'", "''")}'`);
}

export class BackupService {
  constructor(
    private db: Db,
    private dir: string,
  ) {}

  /** 今日のバックアップがまだなければ作る。作ったらファイル名を返す */
  runDaily(now = new Date()): string | null {
    mkdirSync(this.dir, { recursive: true });
    const file = `power-${ymd(now)}.db`;
    if (existsSync(join(this.dir, file))) return null;
    vacuumInto(this.db, join(this.dir, file));
    this.rotate();
    return file;
  }

  /** 手動バックアップ。同じ日のファイルがあれば -2, -3 … と連番を付ける */
  createNow(now = new Date()): string {
    mkdirSync(this.dir, { recursive: true });
    const base = `power-${ymd(now)}`;
    let file = `${base}.db`;
    for (let i = 2; existsSync(join(this.dir, file)); i++) file = `${base}-${i}.db`;
    vacuumInto(this.db, join(this.dir, file));
    this.rotate();
    return file;
  }

  /** インポート直前のバックアップ */
  createPreImport(now = new Date()): string {
    mkdirSync(this.dir, { recursive: true });
    const base = `power-${ymd(now)}-${hms(now)}`;
    let file = `${base}-pre-import.db`;
    for (let i = 2; existsSync(join(this.dir, file)); i++) file = `${base}-${i}-pre-import.db`;
    vacuumInto(this.db, join(this.dir, file));
    this.rotate();
    return file;
  }

  list(): BackupInfo[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => DAILY_RE.test(f) || PRE_IMPORT_RE.test(f))
      .map((f) => {
        const st = statSync(join(this.dir, f));
        return { file: f, createdAt: st.mtime.toISOString(), sizeBytes: st.size };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** 古いバックアップを削除（通常 30 世代、インポート前 5 世代） */
  rotate(): void {
    const files = readdirSync(this.dir);
    const remove = (re: RegExp, keep: number) => {
      const matched = files
        .filter((f) => re.test(f))
        .map((f) => ({ f, t: statSync(join(this.dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t || b.f.localeCompare(a.f));
      for (const { f } of matched.slice(keep)) unlinkSync(join(this.dir, f));
    };
    remove(DAILY_RE, BACKUP_KEEP);
    remove(PRE_IMPORT_RE, PRE_IMPORT_BACKUP_KEEP);
  }
}
