import type { FastifyInstance } from 'fastify';
import type { BackupService } from '../backup.js';

export function dataRoutes(app: FastifyInstance, backups: BackupService): void {
  app.get('/api/backups', async () => backups.list());

  app.post('/api/backups', async (_req, reply) => {
    const file = backups.createNow();
    return reply.status(201).send({ file });
  });
}
