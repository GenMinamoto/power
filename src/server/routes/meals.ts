import type { FastifyInstance } from 'fastify';
import { copyMealsSchema, dateQuerySchema, idParamSchema, mealEntryInputSchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { notFound } from '../errors.js';
import { MealRepository } from '../repositories/meals.js';

export function mealRoutes(app: FastifyInstance, db: Db): void {
  const repo = new MealRepository(db);

  /** その日の全行・区分ごとの小計・1日合計・目標 */
  app.get('/api/meals', async (req) => {
    const { date } = dateQuerySchema.parse(req.query);
    return repo.day(date);
  });

  app.post('/api/meals', async (req, reply) => {
    const input = mealEntryInputSchema.parse(req.body);
    return reply.status(201).send(repo.create(input));
  });

  /** 過去日の食事をコピー（区分指定なしなら全区分） */
  app.post('/api/meals/copy', async (req) => {
    const input = copyMealsSchema.parse(req.body);
    return { copied: repo.copy(input) };
  });

  app.put('/api/meals/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    const input = mealEntryInputSchema.parse(req.body);
    return repo.update(id, input);
  });

  app.delete('/api/meals/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    if (!repo.delete(id)) throw notFound('この食事の記録は見つかりません');
    return reply.status(204).send();
  });
}
