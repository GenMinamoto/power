// スマホ版（dist/mobile）を GitHub Pages と同じ振る舞いで配信する（E2E テスト用）。
// - /power/ 以下でファイルを返す
// - 見つからないパスは 404.html を「404」で返す（GitHub Pages と同じ）

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/mobile/', import.meta.url));
const port = Number(process.env.PORT ?? 3300);
const base = '/power/';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = null;
  if (path.startsWith(base)) {
    const rel = normalize(path.slice(base.length) || 'index.html');
    if (!rel.startsWith('..')) {
      const p = join(root, rel);
      if (existsSync(p) && statSync(p).isFile()) file = p;
      else if (existsSync(join(p, 'index.html'))) file = join(p, 'index.html');
    }
  }
  const status = file ? 200 : 404;
  file ??= join(root, '404.html');
  res.writeHead(status, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}${base}`));
