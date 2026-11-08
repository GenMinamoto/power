import type { FastifyInstance } from 'fastify';
import { today } from '../../shared/date.js';
import type { BackupService } from '../backup.js';
import type { Db } from '../db.js';
import { exportSchema, TransferService } from '../transfer.js';

/** インポートで受け付ける最大サイズ */
export const IMPORT_BODY_LIMIT = 20 * 1024 * 1024;

export function dataRoutes(app: FastifyInstance, db: Db, backups: BackupService): void {
  const transfer = new TransferService(db, backups);

  app.get('/api/backups', async () => backups.list());

  app.post('/api/backups', async (_req, reply) => {
    const file = backups.createNow();
    return reply.status(201).send({ file });
  });

  app.get('/api/export', async (_req, reply) => {
    const file = `power-export-${today().replaceAll('-', '')}.json`;
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file}"`)
      .send(JSON.stringify(transfer.exportAll(), null, 2));
  });

  app.post('/api/import', { bodyLimit: IMPORT_BODY_LIMIT }, async (req) => {
    // 1 件でも不正なら 400（Zod エラー → エラーハンドラ）。この時点では何も変更していない
    const data = exportSchema.parse(req.body);
    return transfer.importAll(data);
  });
}
