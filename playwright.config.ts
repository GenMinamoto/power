import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
// テスト専用の保存先（本番の data/ には触れない）
const DATA_DIR = join(tmpdir(), `power-e2e-${process.pid}`);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // PC にインストール済みの Microsoft Edge を使う（ブラウザの追加ダウンロード不要）
    channel: 'msedge',
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge' } }],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning dist/server/server/index.js',
    url: `http://127.0.0.1:${PORT}/api/backups`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), NO_OPEN: '1', POWER_DATA_DIR: DATA_DIR },
    timeout: 30_000,
  },
});
