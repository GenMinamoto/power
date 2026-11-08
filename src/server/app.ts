import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiErrorBody } from '../shared/types.js';
import { BackupService } from './backup.js';
import type { Db } from './db.js';
import { registerErrorHandler } from './errors.js';
import { bodyLogRoutes } from './routes/bodyLogs.js';
import { dataRoutes } from './routes/data.js';
import { foodRoutes } from './routes/foods.js';
import { goalRoutes } from './routes/goals.js';
import { mealRoutes } from './routes/meals.js';
import { statsRoutes } from './routes/stats.js';

export type AppOptions = {
  db: Db;
  backupDir: string;
  /** ビルド済み画面のフォルダ。指定があり存在すれば配信する */
  clientDir?: string;
  logger?: boolean;
};

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ? { level: 'warn' } : false });
  registerErrorHandler(app);

  const backups = new BackupService(opts.db, opts.backupDir);
  bodyLogRoutes(app, opts.db);
  statsRoutes(app, opts.db);
  mealRoutes(app, opts.db);
  foodRoutes(app, opts.db);
  goalRoutes(app, opts.db);
  dataRoutes(app, backups);

  const serveClient = opts.clientDir != null && existsSync(opts.clientDir);
  if (serveClient) {
    await app.register(fastifyStatic, { root: opts.clientDir!, wildcard: false });
  }

  app.setNotFoundHandler((req, reply) => {
    // 画面側のルーティング（/record/2026-11-08 など）は index.html を返す
    if (serveClient && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '見つかりません' } } satisfies ApiErrorBody);
  });

  return app;
}
