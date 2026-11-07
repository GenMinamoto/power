import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '../shared/types.js';

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (message = '見つかりません') => new HttpError(404, 'NOT_FOUND', message);

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力内容を確認してください',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
      return reply.status(400).send(body);
    }
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } } satisfies ApiErrorBody);
    }
    const status = 'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status < 500) {
      return reply.status(status).send({ error: { code: 'BAD_REQUEST', message: err.message } } satisfies ApiErrorBody);
    }
    req.log.error(err);
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'サーバーでエラーが発生しました' } } satisfies ApiErrorBody);
  });
}
