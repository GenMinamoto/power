import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** package.json がある場所（プロジェクトのルート）を探す。src からでも dist からでも動くように */
function findRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) throw new Error('package.json が見つかりません');
    dir = parent;
  }
}

export const ROOT_DIR = findRoot();
/** 保存先。テスト時は環境変数 POWER_DATA_DIR で別フォルダに切り替える */
export const DATA_DIR = process.env.POWER_DATA_DIR ? resolve(process.env.POWER_DATA_DIR) : join(ROOT_DIR, 'data');
export const DB_PATH = join(DATA_DIR, 'power.db');
export const BACKUP_DIR = join(DATA_DIR, 'backups');
export const CLIENT_DIR = join(ROOT_DIR, 'dist', 'client');
