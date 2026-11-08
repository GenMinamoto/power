import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { today } from '../src/shared/date';

test.describe.configure({ mode: 'serial' });

const T = today();
// phase1〜4 のテストで作ったデータを使う（直近3週間の体重、8/10・8/11 の食事など）

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

type Exported = {
  profile: Record<string, unknown>;
  bodyLogs: Record<string, unknown>[];
  mealEntries: unknown[];
  goals: unknown[];
};
let exported: { path: string; data: Exported };

test('グラフ：週ごとのまとめ', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/charts');
  await page.getByRole('button', { name: '1か月' }).click();
  const rows = page.locator('table.weekly-table tbody tr');
  await expect(rows.first()).toContainText('（今週）');
  // 体重は 1 日 0.1kg ずつ減っているので、前の週（7日分）どうしの差は -0.7kg
  await expect(rows.nth(1).locator('td').nth(2)).toHaveText('-0.7');
  await page.getByRole('heading', { name: '週ごとのまとめ' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/shots/41-weekly.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('履歴：体組成・食事のタブ、未入力の日、連続記録', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/history');
  await expect(page.locator('.history-summary')).toContainText(/体重の連続記録 \d+日/);
  // 今月は今日までの日が並び、先頭が今日
  await expect(page.locator('table.history-table tbody tr').first()).toContainText(String(Number(T.slice(8))));

  await page.getByRole('button', { name: '食事', exact: true }).click();
  await expect(page).toHaveURL(/tab=meals/);
  await page.getByLabel('月を選ぶ').selectOption('2026-08');
  await expect(page).toHaveURL(/month=2026-08/);
  await expect(page.locator('.history-summary')).toContainText('食事を記録した日 2 / 31日');
  const row10 = page.locator('table.history-table tbody tr').filter({ hasText: '8/10' });
  // 卵×3 240 + 白米 400 + 鶏むね 109
  await expect(row10).toContainText('749');
  await expect(row10.locator('td').nth(1)).toHaveText('3');
  await expect(page.locator('table.history-table tbody tr').filter({ hasText: '8/9 ' })).toContainText('未入力');
  await page.screenshot({ path: 'test-results/shots/42-history-meals.png', fullPage: true });

  // 記録画面から戻ってもタブと月が残る
  await row10.click();
  await expect(page).toHaveURL('/record/2026-08-10');
  await page.goBack();
  await expect(page.getByRole('button', { name: '食事', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('月を選ぶ')).toHaveValue('2026-08');
  expect(errors).toEqual([]);
});

test('エクスポート：全データを JSON で書き出す', async ({ page }) => {
  await page.goto('/settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'エクスポート' }).click()]);
  expect(download.suggestedFilename()).toBe(`power-export-${T.replaceAll('-', '')}.json`);
  // ダウンロードはテストの終わりに消されるので、次のテストで使えるよう保存しておく
  const path = 'test-results/e2e-export.json';
  await download.saveAs(path);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  expect(data).toMatchObject({ app: 'power', version: 1 });
  expect(data.bodyLogs.length).toBeGreaterThan(20);
  expect(data.mealEntries.length).toBeGreaterThan(5);
  expect(data.goals.length).toBe(1);
  expect(data.profile.heightCm).toBe(175);
  exported = { path, data };
});

test('インポート：不正なファイルは何も変えずにエラー', async ({ page }) => {
  await page.goto('/settings');
  const input = page.getByLabel('インポートするファイル');

  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{ これは JSON ではない') });
  await expect(page.getByRole('alert')).toContainText('JSON ファイルとして読み込めませんでした');

  await input.setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await expect(page.getByRole('alert')).toContainText('Power でエクスポートしたファイルではありません');

  // 形は正しいが範囲外の値 → サーバーで拒否
  const bad = structuredClone(exported.data);
  bad.bodyLogs[0]!.weightKg = 999;
  page.once('dialog', (d) => void d.accept());
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByRole('alert')).toContainText('何も変更していません');
  await expect(page.getByRole('alert')).toContainText('bodyLogs.0.weightKg');
});

test('インポート：書き出したファイルで元に戻る', async ({ page, request }) => {
  const errors = watchErrors(page);
  // 書き出し後にデータを変える
  expect((await request.put('/api/body-logs/2026-07-01', { data: { weightKg: 70, bodyFatPct: null, memo: null } })).ok()).toBe(true);
  expect((await request.put('/api/profile', { data: { ...exported.data.profile, heightCm: 180, updatedAt: undefined } })).ok()).toBe(true);

  await page.goto('/settings');
  await expect(page.getByLabel('身長')).toHaveValue('180');
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.accept();
  });
  await page.getByLabel('インポートするファイル').setInputFiles(exported.path);
  await expect(page.getByRole('status')).toContainText('読み込みました');
  expect(message).toContain(`体組成 ${exported.data.bodyLogs.length}件`);
  expect(message).toContain('置き換えられます');

  // 画面の入力欄も読み込んだ内容になる
  await expect(page.getByLabel('身長')).toHaveValue('175');
  expect((await (await request.get('/api/body-logs/2026-07-01')).json()).log).toBeNull();
  // 読み込み前のバックアップが作られている
  const backups = (await (await request.get('/api/backups')).json()) as { file: string }[];
  expect(backups.some((b) => b.file.endsWith('-pre-import.db'))).toBe(true);
  await page.screenshot({ path: 'test-results/shots/43-settings-data.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('スマホ幅：履歴・グラフ・設定がはみ出さない', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  for (const path of ['/history', '/history?tab=meals&month=2026-08', '/charts', '/settings']) {
    await page.goto(`http://127.0.0.1:3200${path}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} で横にはみ出しています`).toBeLessThanOrEqual(0);
  }
  await page.goto('http://127.0.0.1:3200/history?tab=meals&month=2026-08');
  await page.screenshot({ path: 'test-results/shots/44-mobile-history.png', fullPage: true });
  await page.goto('http://127.0.0.1:3200/settings');
  await page.getByRole('heading', { name: 'データ' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/shots/45-mobile-settings-data.png', fullPage: true });
  await ctx.close();
});
