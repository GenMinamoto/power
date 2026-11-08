import type { FastifyInstance } from 'fastify';
import { foodInputSchema, foodQuerySchema, idParamSchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { FoodRepository } from '../repositories/foods.js';

export function foodRoutes(app: FastifyInstance, db: Db): void {
  const repo = new FoodRepository(db);

  app.get('/api/foods', async (req) => {
    const { q } = foodQuerySchema.parse(req.query);
    return repo.list(q || undefined);
  });

  app.post('/api/foods', async (req, reply) => {
    const input = foodInputSchema.parse(req.body);
    return reply.status(201).send(repo.create(input));
  });

  app.put('/api/foods/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return repo.update(id, foodInputSchema.parse(req.body));
  });

  app.delete('/api/foods/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    if (!repo.delete(id)) throw notFound('この食品は見つかりません');
    return reply.status(204).send();
  });
}
