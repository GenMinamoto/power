import type { SqlJsStatic } from 'sql.js';
import { initSchema } from '../server/dbCore.js';
import { bodyLogRoutes } from '../server/routes/bodyLogs.js';
import { foodRoutes } from '../server/routes/foods.js';
import { goalRoutes } from '../server/routes/goals.js';
import { mealRoutes } from '../server/routes/meals.js';
import { statsRoutes } from '../server/routes/stats.js';
import { exportSchema, TransferService } from '../server/transfer.js';
import { z } from 'zod';
import { MobileBackups } from './backups.js';
import { LocalRouter, type LocalResponse } from './router.js';
import { SqlJsDb } from './sqljsDb.js';
import type { Storage } from './storage.js';

// スマホ版の「サーバー」。PC 版と同じ routes をブラウザの中で動かし、
// 変更があるたびに DB 全体を端末内（IndexedDB）へ保存する。通信は一切しない。

const restoreSchema = z.object({ file: z.string().min(1).max(100) });

export class MobileBackend {
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(
    private db: SqlJsDb,
    private storage: Storage,
    private backups: MobileBackups,
    private router: LocalRouter,
  ) {}

  static async create(SQL: SqlJsStatic, storage: Storage, now = new Date()): Promise<MobileBackend> {
    const saved = await storage.loadDb();
    const db = new SqlJsDb(SQL, saved);
    initSchema(db);
    const backups = await MobileBackups.load(db, storage);

    const router = new LocalRouter();
    const app = router.asFastify();
    bodyLogRoutes(app, db);
    statsRoutes(app, db);
    mealRoutes(app, db);
    foodRoutes(app, db);
    goalRoutes(app, db);
    dataRoutes(router, db, backups);

    const backend = new MobileBackend(db, storage, backups, router);
    // 初回起動（保存データなし）でなければ、1 日 1 回バックアップ
    if (saved) backups.runDaily(now);
    await backend.persist();
    return backend;
  }

  /** API と同じ形で呼び出す。1 件ずつ順番に処理し、変更は保存が終わってから返す */
  request(method: string, url: string, body?: unknown): Promise<LocalResponse> {
    const run = async (): Promise<LocalResponse> => {
      const res = await this.router.handle(method, url, body);
      if (method === 'GET' || res.status >= 400) return res;
      try {
        await this.persist();
      } catch (e) {
        console.error(e);
        // 保存できなかった変更は取り消して、端末内の状態に戻す
        await this.reload().catch(() => {});
        return {
          status: 500,
          body: { error: { code: 'SAVE_FAILED', message: '端末に保存できませんでした。空き容量を確認してください。' } },
        };
      }
      return res;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private async persist(): Promise<void> {
    await this.backups.flush();
    await this.storage.saveDb(this.db.export());
  }

  private async reload(): Promise<void> {
    const saved = await this.storage.loadDb();
    if (saved) this.db.replace(saved);
  }
}

/** データ：エクスポート・インポート・バックアップ（スマホ版） */
function dataRoutes(router: LocalRouter, db: SqlJsDb, backups: MobileBackups): void {
  const transfer = new TransferService(db, backups);

  router.get('/api/backups', async () => backups.list());

  router.post('/api/backups', async (_req: unknown, reply: { status(n: number): { send(v: unknown): unknown } }) =>
    reply.status(201).send({ file: backups.createNow() }),
  );

  router.post('/api/backups/restore', async (req: { body: unknown }) => {
    const { file } = restoreSchema.parse(req.body);
    return { restored: file, backupFile: await backups.restore(file) };
  });

  router.get('/api/export', async () => transfer.exportAll());

  router.post('/api/import', async (req: { body: unknown }) => transfer.importAll(exportSchema.parse(req.body)));
}
