import type { FastifyInstance } from 'fastify';
import { weeklySummary } from '../../shared/calc.js';
import { today, weekStart } from '../../shared/date.js';
import { dateQuerySchema, rangeQuerySchema } from '../../shared/schemas.js';
import type { Db } from '../db.js';
import { StatsRepository } from '../repositories/stats.js';

export function statsRoutes(app: FastifyInstance, db: Db): void {
  const repo = new StatsRepository(db);

  app.get('/api/dashboard', async (req) => {
    const { date } = dateQuerySchema.parse(req.query);
    return repo.dashboard(date);
  });

  /** 省略時は最初の記録日〜今日 */
  app.get('/api/stats/daily', async (req) => {
    const q = rangeQuerySchema.parse(req.query);
    const to = q.to ?? today();
    const from = q.from ?? repo.firstRecordDate() ?? to;
    return repo.daily(from, to);
  });

  /** 月曜始まりの週ごと。from はその週の月曜まで広げる。省略時は全期間 */
  app.get('/api/stats/weekly', async (req) => {
    const q = rangeQuerySchema.parse(req.query);
    const to = q.to ?? today();
    const from = q.from ?? repo.firstRecordDate() ?? to;
    return weeklySummary(repo.daily(weekStart(from), to));
  });
}