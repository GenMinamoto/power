// スマホ版の保存先。本番はブラウザの IndexedDB、テストではメモリを使う。

export type StoredBackup = { file: string; createdAt: string; bytes: Uint8Array };

export interface Storage {
  loadDb(): Promise<Uint8Array | null>;
  saveDb(bytes: Uint8Array): Promise<void>;
  /** バックアップの一覧（中身なし） */
  listBackups(): Promise<{ file: string; createdAt: string; sizeBytes: number }[]>;
  getBackup(file: string): Promise<StoredBackup | null>;
  putBackup(b: StoredBackup): Promise<void>;
  deleteBackup(file: string): Promise<void>;
}

export class MemoryStorage implements Storage {
  db: Uint8Array | null = null;
  backups = new Map<string, StoredBackup>();

  async loadDb() {
    return this.db;
  }
  async saveDb(bytes: Uint8Array) {
    this.db = bytes;
  }
  async listBackups() {
    return [...this.backups.values()].map((b) => ({ file: b.file, createdAt: b.createdAt, sizeBytes: b.bytes.byteLength }));
  }
  async getBackup(file: string) {
    return this.backups.get(file) ?? null;
  }
  async putBackup(b: StoredBackup) {
    this.backups.set(b.file, b);
  }
  async deleteBackup(file: string) {
    this.backups.delete(file);
  }
}

const DB_NAME = 'power';
const KV = 'kv';
const BACKUPS = 'backups';
const BACKUP_META = 'backupMeta';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました'));
  });
}

/** ブラウザ内の IndexedDB に保存する。書き込みは完了（ディスクへの確定）まで待つ */
export class IndexedDbStorage implements Storage {
  private constructor(private idb: IDBDatabase) {}

  static async open(): Promise<IndexedDbStorage> {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore(KV);
      db.createObjectStore(BACKUPS);
      db.createObjectStore(BACKUP_META, { keyPath: 'file' });
    };
    return new IndexedDbStorage(await req(r));
  }

  async loadDb() {
    const tx = this.idb.transaction(KV, 'readonly');
    const v = (await req(tx.objectStore(KV).get('db'))) as Uint8Array | undefined;
    return v ?? null;
  }

  async saveDb(bytes: Uint8Array) {
    const tx = this.idb.transaction(KV, 'readwrite', { durability: 'strict' });
    tx.objectStore(KV).put(bytes, 'db');
    await done(tx);
  }

  async listBackups() {
    const tx = this.idb.transaction(BACKUP_META, 'readonly');
    return (await req(tx.objectStore(BACKUP_META).getAll())) as { file: string; createdAt: string; sizeBytes: number }[];
  }

  async getBackup(file: string) {
    const tx = this.idb.transaction([BACKUPS, BACKUP_META], 'readonly');
    const [bytes, meta] = (await Promise.all([req(tx.objectStore(BACKUPS).get(file)), req(tx.objectStore(BACKUP_META).get(file))])) as [
      Uint8Array | undefined,
      { createdAt: string } | undefined,
    ];
    return bytes && meta ? { file, createdAt: meta.createdAt, bytes } : null;
  }

  async putBackup(b: StoredBackup) {
    const tx = this.idb.transaction([BACKUPS, BACKUP_META], 'readwrite', { durability: 'strict' });
    tx.objectStore(BACKUPS).put(b.bytes, b.file);
    tx.objectStore(BACKUP_META).put({ file: b.file, createdAt: b.createdAt, sizeBytes: b.bytes.byteLength });
    await done(tx);
  }

  async deleteBackup(file: string) {
    const tx = this.idb.transaction([BACKUPS, BACKUP_META], 'readwrite');
    tx.objectStore(BACKUPS).delete(file);
    tx.objectStore(BACKUP_META).delete(file);
    await done(tx);
  }
}
