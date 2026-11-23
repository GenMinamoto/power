// スマホ版の Service Worker（ビルド時に版番号・公開先・ファイル一覧を埋め込んで dist/mobile/sw.js になる）
// 役割：アプリの画面のファイルを端末に保存し、電波がなくても開けるようにする。
// 記録データには一切関わらない（データは IndexedDB にあり、ここを通らない）。

const VERSION = '__VERSION__';
const BASE = '__BASE__';
const FILES = __FILES__;
const CACHE = `power-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => BASE + f)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  // 古い版の保存を消す
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('power-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // 画面の移動（/power/record/... など）は、すべて保存済みの index.html で開く
  if (req.mode === 'navigate') {
    event.respondWith(caches.match(BASE + 'index.html').then((hit) => hit ?? fetch(req)));
    return;
  }
  // それ以外は保存済みを優先し、なければ取りに行く
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
