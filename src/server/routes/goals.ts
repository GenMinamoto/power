import type { FastifyInstance } from 'fastify';
import { dateQuerySchema, goalInputSchema, idParamSchema, profileInputSchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { GoalRepository } from '../repositories/goals.js';
import { ProfileRepository } from '../repositories/profile.js';

export function goalRoutes(app: FastifyInstance, db: Db): void {
  const goals = new GoalRepository(db);
  const profile = new ProfileRepository(db);

  app.get('/api/profile', async () => profile.get());

  app.put('/api/profile', async (req) => profile.save(profileInputSchema.parse(req.body)));

  /** 開始日の新しい順 */
  app.get('/api/goals', async () => goals.all().reverse());

  app.get('/api/goals/effective', async (req) => {
    const { date } = dateQuerySchema.parse(req.query);
    return goals.effective(date);
  });

  app.post('/api/goals', async (req, reply) => {
    const input = goalInputSchema.parse(req.body);
    return reply.status(201).send(goals.upsert(input));
  });

  app.delete('/api/goals/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    if (!goals.delete(id)) throw notFound('この目標は見つかりません');
    return reply.status(204).send();
  });
}
