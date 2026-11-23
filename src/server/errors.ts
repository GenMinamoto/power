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

/** 例外を「ステータス＋エラー本文」に変換する。500 のときは internal=true（ログに残す用） */
export function toErrorResponse(err: unknown): { status: number; body: ApiErrorBody; internal: boolean } {
  if (err instanceof ZodError) {
    return {
      status: 400,
      internal: false,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: '入力内容を確認してください',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
    };
  }
  if (err instanceof HttpError) {
    return { status: err.statusCode, internal: false, body: { error: { code: err.code, message: err.message } } };
  }
  const e = err as Partial<FastifyError> | null;
  const status = e != null && typeof e.statusCode === 'number' ? e.statusCode : 500;
  if (status < 500) {
    return { status, internal: false, body: { error: { code: 'BAD_REQUEST', message: String(e?.message) } } };
  }
  return { status: 500, internal: true, body: { error: { code: 'INTERNAL_ERROR', message: 'サーバーでエラーが発生しました' } } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    const r = toErrorResponse(err);
    if (r.internal) req.log.error(err);
    return reply.status(r.status).send(r.body);
  });
}
