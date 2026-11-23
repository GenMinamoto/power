import type { LocalResponse } from '../../mobile/router';

// PC 版のビルドで「端末内のバックエンド」の代わりに入る空の部品（vite.config.ts の alias で差し替え）。
// スマホ用の SQLite（WebAssembly）を PC 版に含めないため。

export async function localRequest(_method: string, _path: string, _body?: unknown): Promise<LocalResponse> {
  throw new Error('PC 版では使えません');
}
