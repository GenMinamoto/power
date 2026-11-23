import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { MobileBackend } from './backend.js';
import type { LocalResponse } from './router.js';
import { IndexedDbStorage } from './storage.js';

// スマホ版の画面から呼ばれる入口。初回呼び出しのときに DB を端末から読み込む。

let backend: Promise<MobileBackend> | null = null;

function start(): Promise<MobileBackend> {
  backend ??= (async () => {
    // ブラウザの都合でデータが消されないよう、保存領域の永続化をお願いしておく
    void navigator.storage?.persist?.().catch(() => {});
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    return MobileBackend.create(SQL, await IndexedDbStorage.open());
  })();
  backend.catch(() => {
    backend = null; // 次の呼び出しでやり直す
  });
  return backend;
}

export async function localRequest(method: string, path: string, body?: unknown): Promise<LocalResponse> {
  return (await start()).request(method, path, body);
}
