import { initSchema } from '../server/dbCore.js';
import { HttpError, notFound } from '../server/errors.js';
import type { PreImportBackup } from '../server/transfer.js';
import { BACKUP_KEEP, PRE_IMPORT_BACKUP_KEEP } from '../shared/constants.js';
import type { BackupInfo } from '../shared/types.js';
import type { SqlJsDb } from './sqljsDb.js';
import type { Storage } from './storage.js';

// スマホ版のバックアップ。DB の複製をブラウザ内（IndexedDB）に保存する。
// ファイル名の付け方と保持数は PC 版（server/backup.ts）と同じ。

const DAILY_RE = /^power-\d{8}(-\d+)?\.db$/;
const PRE_IMPORT_RE = /^power-\d{8}-\d{6}(-\d+)?-pre-import\.db$/;

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const hms = (d: Date) => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export class MobileBackups implements PreImportBackup {
  private pending: Promise<unknown>[] = [];

  private constructor(
    private db: SqlJsDb,
    private storage: Storage,
    private meta: BackupInfo[],
  ) {}

  static async load(db: SqlJsDb, storage: Storage): Promise<MobileBackups> {
    const b = new MobileBackups(db, storage, await storage.listBackups());
    b.sort();
    return b;
  }

  list(): BackupInfo[] {
    return this.meta.map((m) => ({ ...m }));
  }

  /** 今日のバックアップがまだなければ作る */
  runDaily(now = new Date()): string | null {
    const file = `power-${ymd(now)}.db`;
    if (this.has(file)) return null;
    this.add(file, now);
    return file;
  }

  createNow(now = new Date()): string {
    const base = `power-${ymd(now)}`;
    let file = `${base}.db`;
    for (let i = 2; this.has(file); i++) file = `${base}-${i}.db`;
    this.add(file, now);
    return file;
  }

  createPreImport(now = new Date()): string {
    const base = `power-${ymd(now)}-${hms(now)}`;
    let file = `${base}-pre-import.db`;
    for (let i = 2; this.has(file); i++) file = `${base}-${i}-pre-import.db`;
    this.add(file, now);
    return file;
  }

  /** バックアップの内容に戻す。戻す前の状態もバックアップしておく */
  async restore(file: string): Promise<string> {
    const b = await this.storage.getBackup(file);
    if (!b) throw notFound('このバックアップは見つかりません');
    const before = this.db.export();
    const backupFile = this.createPreImport();
    try {
      this.db.replace(b.bytes);
      initSchema(this.db);
    } catch (e) {
      this.db.replace(before);
      throw new HttpError(400, 'RESTORE_FAILED', `このバックアップは読み込めませんでした（${(e as Error).message}）`);
    }
    return backupFile;
  }

  /** 未完了の保存をすべて待つ */
  async flush(): Promise<void> {
    const p = this.pending;
    this.pending = [];
    await Promise.all(p);
  }

  private has(file: string): boolean {
    return this.meta.some((m) => m.file === file);
  }

  private add(file: string, now: Date): void {
    const bytes = this.db.export();
    const createdAt = now.toISOString();
    this.meta.push({ file, createdAt, sizeBytes: bytes.byteLength });
    this.pending.push(this.storage.putBackup({ file, createdAt, bytes }));
    this.sort();
    this.rotate();
  }

  private sort(): void {
    this.meta.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.file.localeCompare(a.file));
  }

  /** 古いものを削除（通常 30 世代、インポート・復元前 5 世代） */
  private rotate(): void {
    const remove = (re: RegExp, keep: number) => {
      for (const m of this.meta.filter((x) => re.test(x.file)).slice(keep)) {
        this.meta = this.meta.filter((x) => x !== m);
        this.pending.push(this.storage.deleteBackup(m.file));
      }
    };
    remove(DAILY_RE, BACKUP_KEEP);
    remove(PRE_IMPORT_RE, PRE_IMPORT_BACKUP_KEEP);
  }
}
