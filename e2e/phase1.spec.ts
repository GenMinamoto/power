import { expect, test, type Page } from '@playwright/test';
import { addDays, today } from '../src/shared/date';

// 1 つのサーバー・DB を順番に使うので直列で実行する
test.describe.configure({ mode: 'serial' });

const T = today();
const D1 = '2026-10-01';
const D2 = '2026-10-02';
const D15 = '2026-10-15';

/** ブラウザのコンソールエラーとページ例外を集める */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function saveBody(page: Page, date: string, weight: string, fat = '') {
  await page.goto(`/record/${date}`);
  await page.getByLabel('体重').fill(weight);
  await page.getByLabel('体脂肪率（2週間に1回）').fill(fat);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('保存しました');
}

test('ホーム：記録がない状態で表示できる', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: '今日の記録へ →' })).toBeVisible();
  await expect(page.getByText('体脂肪率がまだ記録されていません。')).toBeVisible();
  await expect(page.getByText('この期間の体重の記録はまだありません')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/01-home-empty.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('記録：開くと体重欄にフォーカスがあり、Enter で保存できる', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/record/${D1}`);
  const weight = page.getByLabel('体重');
  await expect(weight).toBeFocused();
  await weight.fill('76.0');
  await weight.press('Enter');
  await expect(page.getByRole('status')).toHaveText('保存しました');

  // 再読み込みしても残っている
  await page.reload();
  await expect(page.getByLabel('体重')).toHaveValue('76');
  expect(errors).toEqual([]);
});

test('記録：入力チェック（範囲外・両方空）', async ({ page }) => {
  await page.goto(`/record/${addDays(D1, 1)}`);
  await page.getByLabel('体重').fill('500');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('20〜300の範囲で入力してください')).toBeVisible();

  await page.getByLabel('体重').fill('');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByText('体重か体脂肪率のどちらかを入力してください')).toBeVisible();
});

test('記録：前回の体重が表示され、3kg 以上の変化は確認ダイアログが出る', async ({ page }) => {
  await page.goto(`/record/${D2}`);
  await expect(page.getByText('前回 76kg（10/1）')).toBeVisible();

  // キャンセル → 保存されない
  page.once('dialog', (d) => {
    expect(d.message()).toContain('+4.0kg');
    void d.dismiss();
  });
  await page.getByLabel('体重').fill('80');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('button', { name: '削除' })).toHaveCount(0);

  // OK → 保存される
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('保存しました');
  await expect(page.getByRole('button', { name: '削除' })).toBeVisible();
});

test('記録：削除できる', async ({ page }) => {
  await page.goto(`/record/${D2}`);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: '削除' }).click();
  await expect(page.getByRole('status')).toHaveText('削除しました');
  await expect(page.getByLabel('体重')).toHaveValue('');
});

test('記録：体脂肪率を入れると除脂肪体重と前回からの変化が出る', async ({ page }) => {
  await saveBody(page, D1, '76', '19');
  await expect(page.getByText('除脂肪体重 61.6kg')).toBeVisible();
  await expect(page.getByText('体脂肪量 14.4kg')).toBeVisible();

  await saveBody(page, D15, '75', '18');
  await expect(page.getByText('除脂肪体重 61.5kg')).toBeVisible();
  await expect(page.getByText(/前回の測定（14日前）から：体重 -1\.0kg ／ 体脂肪率 -1\.0% ／ 除脂肪体重 -0\.1kg ／ 体脂肪量 -0\.9kg/)).toBeVisible();
});

test('記録：前後の日への移動（ボタン・Alt+矢印）', async ({ page }) => {
  await page.goto(`/record/${D15}`);
  await page.getByRole('button', { name: '前の日' }).click();
  await expect(page).toHaveURL(`/record/2026-10-14`);
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page).toHaveURL(`/record/${D15}`);
  await expect(page.getByLabel('体重')).toHaveValue('75');
  await page.getByRole('button', { name: '今日' }).click();
  await expect(page).toHaveURL(`/record/${T}`);
});

test('記録：不正な日付の URL は今日に移動する', async ({ page }) => {
  await page.goto('/record/2026-02-30');
  await expect(page).toHaveURL(`/record/${T}`);
});

test('ホーム：最新の値・7日平均・お知らせ', async ({ page }) => {
  const errors = watchErrors(page);
  // 今日を含む直近 7 日に 5 日分の体重
  const ws = ['75.0', '74.8', '74.9', '74.6', '74.5'];
  for (let i = 0; i < ws.length; i++) await saveBody(page, addDays(T, -(ws.length - 1 - i)), ws[i]!);

  await page.goto('/');
  await expect(page.locator('.stat-value').first()).toHaveText('74.5kg');
  await expect(page.getByText('前回比 -0.1kg')).toBeVisible();
  await expect(page.locator('.stat-value').nth(1)).toHaveText('74.8kg'); // (75+74.8+74.9+74.6+74.5)/5 = 74.76
  // 体脂肪率は 10/15 が最後 → お知らせが出る
  await expect(page.getByText(/前回の体脂肪率の測定（10\/15）から\d+日たちました/)).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/shots/02-home.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('グラフ：期間切り替えと表示', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/charts');
  await page.getByRole('button', { name: '全期間' }).click();
  await expect(page.getByRole('button', { name: '全期間' })).toHaveAttribute('aria-pressed', 'true');
  // 体重・体脂肪率・除脂肪体重・体脂肪量（食事の記録がないのでカロリー・PFC は空表示）
  await expect(page.locator('canvas')).toHaveCount(4);
  await expect(page.getByText('この期間の食事の記録はまだありません')).toHaveCount(2);
  await page.screenshot({ path: 'test-results/shots/03-charts-all.png', fullPage: true });

  // 1週間：体脂肪率の記録がないので空表示
  await page.getByRole('button', { name: '1週間' }).click();
  await expect(page.getByText('この期間の体脂肪率の記録はまだありません')).toBeVisible();

  // 選んだ期間は再読み込み後も残る
  await page.reload();
  await expect(page.getByRole('button', { name: '1週間' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('履歴：月ごとの一覧とクリックで記録画面へ', async ({ page }) => {
  await page.goto('/history');
  await page.getByLabel('月を選ぶ').selectOption('2026-10');
  // 記録のない日も「未入力」として並ぶ（10月は 31 日分）
  await expect(page.locator('table.data tbody tr')).toHaveCount(31);
  await expect(page.locator('table.data tbody tr.empty-day').first()).toContainText('未入力');
  const rows = page.locator('table.data tbody tr:not(.empty-day)');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('61.5');
  await rows.first().click();
  await expect(page).toHaveURL(`/record/${D15}`);
});

test('設定：手動バックアップ', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: '今すぐバックアップ' }).click();
  await expect(page.getByRole('status')).toContainText('バックアップしました');
  await expect(page.getByText(/最終バックアップ：/)).toBeVisible();
});

test('スマホ幅：横スクロールが出ず、下にメニューが出る', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  for (const path of ['/', `/record/${T}`, '/charts', '/history', '/settings']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} で横にはみ出しています`).toBeLessThanOrEqual(0);
  }
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'メニュー' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/04-mobile-home.png', fullPage: true });
  await page.goto(`/record/${T}`);
  await page.screenshot({ path: 'test-results/shots/05-mobile-record.png', fullPage: true });
  await ctx.close();
});

test('ダークモードで表示できる', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'ja-JP' });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto('/charts');
  await page.getByRole('button', { name: '全期間' }).click();
  await page.waitForLoadState('networkidle');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(18, 18, 17)');
  await page.screenshot({ path: 'test-results/shots/06-dark-charts.png', fullPage: true });
  await page.goto(`/record/${D15}`);
  await page.screenshot({ path: 'test-results/shots/07-dark-record.png', fullPage: true });
  expect(errors).toEqual([]);
  await ctx.close();
});
