import { createHash } from 'node:crypto';
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// PC 版：vite build（dist/client、PC のサーバーが配信）
// スマホ版：vite build --mode mobile（dist/mobile、GitHub Pages で公開。データは端末内にだけ保存）

/**
 * 外部への通信を一切禁止する設定（Content Security Policy）。
 * 自分のサイト（'self'）以外からの読み込み・送信をブラウザが拒否する。
 * - wasm-unsafe-eval：端末内の SQLite（WebAssembly）を動かすために必要
 * - style-src の unsafe-inline：WebKit（iPhone）でライブラリの見た目の指定が拒否されるため許可。
 *   見た目の指定から外部の画像・フォントを読もうとしても img-src / font-src で拒否されるので、通信は増えない
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

/** スマホ版の追加：CSP・ホーム画面用の設定・オフライン用の Service Worker・GitHub Pages 用の 404.html */
function mobilePwa(base: string, outDir: string): Plugin {
  return {
    name: 'power-mobile-pwa',
    apply: 'build',
    transformIndexHtml(html) {
      return html
        // 絵文字の SVG アイコン（data: URL）は WebKit で CSP の警告が出るため、PNG のアイコンにする
        .replace(/<link rel="icon" href="data:[^"]*" \/>/, `<link rel="icon" type="image/png" href="${base}icons/icon-192.png" />`)
        .replace('width=device-width, initial-scale=1', 'width=device-width, initial-scale=1, viewport-fit=cover')
        .replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${CSP}" />
    <meta name="referrer" content="no-referrer" />`,
        )
        .replace(
          '</head>',
          `  <meta name="theme-color" content="#2a78d6" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Power" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <link rel="apple-touch-icon" href="${base}icons/apple-touch-icon.png" />
    <link rel="manifest" href="${base}manifest.webmanifest" />
  </head>`,
        );
    },
    generateBundle() {
      const manifest = {
        name: 'Power',
        short_name: 'Power',
        description: 'ボディメイク記録（データはこの端末の中にだけ保存）',
        lang: 'ja',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f6f4',
        theme_color: '#2a78d6',
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
    },
    closeBundle() {
      const out = resolve(outDir);
      // GitHub Pages は知らないパス（/power/record/... など）に 404.html を返すので、画面をそのまま入れておく
      copyFileSync(join(out, 'index.html'), join(out, '404.html'));

      const files = listFiles(out)
        .map((p) => relative(out, p).replaceAll('\\', '/'))
        .filter((f) => f !== 'sw.js' && f !== '404.html')
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
      const sw = readFileSync(resolve('src/mobile/sw.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__BASE__', base)
        .replace('__FILES__', JSON.stringify(files));
      writeFileSync(join(out, 'sw.js'), sw);
    },
  };
}

export default defineConfig(({ mode }) => {
  const mobile = mode === 'mobile';
  // GitHub Pages の公開先（https://<ユーザー名>.github.io/power/）
  const base = mobile ? (process.env.POWER_BASE ?? '/power/') : '/';
  const outDir = mobile ? 'dist/mobile' : 'dist/client';

  return {
    plugins: [react(), ...(mobile ? [mobilePwa(base, outDir)] : [])],
    root: 'src/client',
    base,
    resolve: {
      alias: {
        'power:local-backend': resolve(mobile ? 'src/mobile/client.ts' : 'src/client/api/noLocalBackend.ts'),
      },
    },
    publicDir: mobile ? resolve('src/mobile/public') : false,
    // 定数として埋め込み、使わない側の処理はビルドから取り除かれる
    define: { 'import.meta.env.VITE_PLATFORM': JSON.stringify(mobile ? 'mobile' : 'pc') },
    build: {
      outDir: resolve(outDir),
      emptyOutDir: true,
      // ローカル専用アプリなのでバンドルサイズの警告はゆるめる
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': 'http://127.0.0.1:3000',
      },
    },
  };
});
