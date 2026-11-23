import { defineConfig, devices } from '@playwright/test';

// スマホ版の E2E テスト。iPhone の画面サイズ・タッチ操作で、GitHub Pages と同じ配信方法で確かめる。
// 先に npm run build:mobile が必要（npm run test:e2e:mobile なら自動で行う）
const PORT = 3300;

export default defineConfig({
  testDir: 'e2e-mobile',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/mobile',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/power/`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // iPhone 15 の画面サイズ・タッチ操作。ブラウザは PC にある Edge を使う
      name: 'iphone-edge',
      use: { ...devices['iPhone 15'], browserName: 'chromium', channel: 'msedge' },
    },
    {
      // iPhone の Safari と同じエンジン（WebKit）。初回は npx playwright install webkit が必要
      name: 'iphone-webkit',
      use: { ...devices['iPhone 15'] },
    },
  ],
  webServer: {
    command: 'node scripts/serve-mobile.mjs',
    url: `http://127.0.0.1:${PORT}/power/`,
    reuseExistingServer: false,
    env: { PORT: String(PORT) },
    timeout: 30_000,
  },
});
