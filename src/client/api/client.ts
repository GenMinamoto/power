import type { ApiErrorBody } from '../../shared/types';
import { IS_MOBILE } from '../platform';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

function fail(status: number, data: unknown): never {
  const err = (data as ApiErrorBody | null)?.error;
  throw new ApiError(status, err?.message ?? `エラーが発生しました（${status}）`, err?.details);
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (IS_MOBILE) return localApi<T>(path, init);

  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'サーバーに接続できませんでした。Power が起動しているか確認してください。');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) fail(res.status, data);
  return data as T;
}

/** スマホ版：通信はせず、端末内の DB を直接操作する */
async function localApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: { status: number; body: unknown };
  try {
    // スマホ版では src/mobile/client.ts、PC 版では空の部品になる（vite.config.ts の alias）
    const { localRequest } = await import('power:local-backend');
    res = await localRequest(init?.method ?? 'GET', path, init?.body);
  } catch (e) {
    console.error(e);
    throw new ApiError(0, `端末内のデータを開けませんでした。アプリを開き直してください。（${(e as Error).message}）`);
  }
  if (res.status >= 400) fail(res.status, res.body);
  return res.body as T;
}
