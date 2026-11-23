import type { FastifyInstance } from 'fastify';
import { dateQuerySchema, healthWorkoutInputSchema, idParamSchema, workoutInputSchema } from '../../shared/schemas.js';
import type { SqlDb as Db } from '../dbCore.js';
import { notFound } from '../errors.js';
import { WorkoutRepository } from '../repositories/workouts.js';

export function workoutRoutes(app: FastifyInstance, db: Db): void {
  const repo = new WorkoutRepository(db);

  /** その日の運動と、目標への上乗せ */
  app.get('/api/workouts', async (req) => {
    const { date } = dateQuerySchema.parse(req.query);
    return repo.day(date);
  });

  app.post('/api/workouts', async (req, reply) => {
    const input = workoutInputSchema.parse(req.body);
    return reply.status(201).send(repo.create(input));
  });

  /** ヘルスケア（ショートカット）からの取り込み。同じ日・種目・名前なら上書き */
  app.post('/api/workouts/health', async (req) => {
    const input = healthWorkoutInputSchema.parse(req.body);
    return repo.importHealth(input);
  });

  app.put('/api/workouts/:id', async (req) => {
    const { id } = idParamSchema.parse(req.params);
    return repo.update(id, workoutInputSchema.parse(req.body));
  });

  app.delete('/api/workouts/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    if (!repo.delete(id)) throw notFound('この運動の記録は見つかりません');
    return reply.status(204).send();
  });
}
