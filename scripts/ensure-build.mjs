// 起動前の準備：必要なときだけ npm install / ビルドを実行する。
// - package-lock.json が node_modules より新しい → npm install（git pull で依存が増えた場合など）
// - ソース（src/ や設定ファイル）がビルド結果より新しい → npm run build
// start.bat から呼ばれる。

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(root, ...parts);

/** ファイル／フォルダ内で最も新しい更新日時（ms）。存在しなければ 0 */
function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (!st.isDirectory()) return st.mtimeMs;
  let max = 0;
  for (const name of readdirSync(path)) max = Math.max(max, newestMtime(join(path, name)));
  return max;
}

/** ファイルの更新日時（ms）。存在しなければ null */
function mtime(path) {
  return existsSync(path) ? statSync(path).mtimeMs : null;
}

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

// 1. 依存パッケージ
const installed = mtime(p('node_modules', '.package-lock.json'));
const lock = mtime(p('package-lock.json')) ?? 0;
if (installed == null || lock > installed) {
  console.log('[Power] 必要なパッケージをインストールします...');
  run('npm install');
}

// 2. ビルド
const SOURCES = ['src', 'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.server.json'];
const newestSource = Math.max(...SOURCES.map((s) => newestMtime(p(s))));
const outputs = [p('dist', 'client', 'index.html'), p('dist', 'server', 'server', 'index.js')].map(mtime);
const builtAt = outputs.includes(null) ? null : Math.min(...outputs);

if (builtAt == null) {
  console.log('[Power] 初回のビルドを行います...');
  run('npm run build');
} else if (newestSource > builtAt) {
  console.log('[Power] プログラムが更新されているため、ビルドし直します...');
  run('npm run build');
} else {
  console.log('[Power] ビルド済み（最新）です。');
}
