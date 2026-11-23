// スマホ版のアイコン（PNG）を作る。Edge で絵を描いて画像として保存する。
// 実行：node scripts/make-icons.mjs（作った画像はリポジトリに入れるので、普段は実行不要）

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'mobile', 'public', 'icons');
mkdirSync(out, { recursive: true });

// [ファイル名, 一辺の大きさ, 絵の大きさの割合]。maskable は端末側で丸く切り抜かれる前提で小さめに
const ICONS = [
  ['apple-touch-icon.png', 180, 0.62],
  ['icon-192.png', 192, 0.62],
  ['icon-512.png', 512, 0.62],
  ['icon-maskable-512.png', 512, 0.5],
];

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
for (const [file, size, ratio] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:#2a78d6;display:flex;align-items:center;justify-content:center">
      <span style="font-size:${Math.round(size * ratio)}px;line-height:1;font-family:'Segoe UI Emoji','Apple Color Emoji',sans-serif">💪</span>
    </div></body></html>`);
  await page.screenshot({ path: join(out, file), omitBackground: false });
  console.log(`作成：icons/${file}`);
}
await browser.close();
