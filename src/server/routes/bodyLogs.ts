import type { FastifyInstance } from 'fastify';
import { bodyLogInputSchema, dateParamSchema, rangeQuerySchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { BodyLogRepository } from '../repositories/bodyLogs.js';

export function bodyLogRoutes(app: FastifyInstance, db: Db): void {
  const repo = new BodyLogRepository(db);

  app.get('/api/body-logs', async (req) => {
    const { from, to } = rangeQuerySchema.parse(req.query);
    return repo.list(from, to);
  });

  /** その日の記録（なければ log=null）と、前回の体重・体脂肪率 */
  app.get('/api/body-logs/:date', async (req) => {
    const { date } = dateParamSchema.parse(req.params);
    return repo.detail(date);
  });

  app.put('/api/body-logs/:date', async (req) => {
    const { date } = dateParamSchema.parse(req.params);
    const input = bodyLogInputSchema.parse(req.body);
    return repo.upsert(date, input);
  });

  app.delete('/api/body-logs/:date', async (req, reply) => {
    const { date } = dateParamSchema.parse(req.params);
    if (!repo.delete(date)) throw notFound('この日の体組成の記録はありません');
    return reply.status(204).send();
  });
}
