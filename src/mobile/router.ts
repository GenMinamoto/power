import type { FastifyInstance } from 'fastify';
import { toErrorResponse } from '../server/errors.js';

// PC 版の routes/*.ts（Fastify 用）を、そのままブラウザの中で動かすための小さな受け口。
// routes が使う機能（get/post/put/delete、req.params/query/body、reply.status/header/send）だけを持つ。

export type LocalResponse = { status: number; body: unknown };

type Req = { params: Record<string, string>; query: Record<string, string>; body: unknown };
type Handler = (req: Req, reply: Reply) => unknown;
type Route = { method: string; re: RegExp; keys: string[]; isStatic: boolean; handler: Handler };

class Reply {
  statusCode = 200;
  payload: unknown = undefined;
  status(code: number): this {
    this.statusCode = code;
    return this;
  }
  header(_name: string, _value: string): this {
    return this;
  }
  send(payload?: unknown): this {
    this.payload = payload;
    return this;
  }
}

/** JSON を通したのと同じ形にする（PC 版と同じく、undefined の削除や Date の文字列化が起きる） */
const viaJson = (v: unknown): unknown => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class LocalRouter {
  private routes: Route[] = [];

  get = (path: string, a: unknown, b?: unknown) => this.add('GET', path, a, b);
  post = (path: string, a: unknown, b?: unknown) => this.add('POST', path, a, b);
  put = (path: string, a: unknown, b?: unknown) => this.add('PUT', path, a, b);
  delete = (path: string, a: unknown, b?: unknown) => this.add('DELETE', path, a, b);

  /** routes/*.ts に渡すための型合わせ（使う機能は上のものだけ） */
  asFastify(): FastifyInstance {
    return this as unknown as FastifyInstance;
  }

  private add(method: string, path: string, a: unknown, b?: unknown): void {
    const handler = (typeof a === 'function' ? a : b) as Handler;
    const keys: string[] = [];
    const pattern = path.replace(/:([A-Za-z]+)/g, (_, k: string) => {
      keys.push(k);
      return '([^/]+)';
    });
    this.routes.push({ method, re: new RegExp(`^${pattern}$`), keys, isStatic: keys.length === 0, handler });
    // 固定のパス（/api/meals/copy など）を、変数入りのパス（/api/meals/:id）より先に照合する
    this.routes.sort((x, y) => Number(y.isStatic) - Number(x.isStatic));
  }

  async handle(method: string, url: string, body?: unknown): Promise<LocalResponse> {
    const u = new URL(url, 'http://local');
    const query = Object.fromEntries(u.searchParams);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.re.exec(u.pathname);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1]!)]));
      const reply = new Reply();
      try {
        const result = await r.handler({ params, query, body: viaJson(body) }, reply);
        const payload = result === reply ? reply.payload : result;
        return { status: reply.statusCode, body: viaJson(payload) };
      } catch (e) {
        const er = toErrorResponse(e);
        if (er.internal) console.error(e);
        return { status: er.status, body: er.body };
      }
    }
    return { status: 404, body: { error: { code: 'NOT_FOUND', message: '見つかりません' } } };
  }
}
