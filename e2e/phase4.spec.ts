import { expect, test, type Page } from '@playwright/test';
import { addDays, today } from '../src/shared/date';

test.describe.configure({ mode: 'serial' });

const T = today();
// 年齢がいつ実行しても 30 歳になる生年月日
const BIRTH = `${Number(T.slice(0, 4)) - 30}-01-01`;
const TARGET_DATE = addDays(T, 140);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const result = (page: Page) => page.locator('.plan-result');

test('準備：直近3週間の体重（1日 0.1kg ずつ減る）', async ({ request }) => {
  for (let i = 20; i >= 0; i--) {
    const res = await request.put(`/api/body-logs/${addDays(T, -i)}`, {
      data: { weightKg: Math.round((77 - (20 - i) * 0.1) * 10) / 10, bodyFatPct: i === 0 ? 18 : null, memo: null },
    });
    expect(res.ok()).toBe(true);
  }
});

test('目安計算：プロフィールを入れると計算され、自動で保存される', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/settings');
  await expect(page.getByText('まだ目標がありません。')).toBeVisible();
  // 体重は最新の記録が入っている
  await expect(page.getByLabel('体重', { exact: true })).toHaveValue('75');
  await expect(result(page)).toContainText('性別・生年月日・身長を入力するか');

  await page.getByLabel('性別').selectOption('male');
  await page.getByLabel('生年月日').fill(BIRTH);
  await page.getByLabel('身長').fill('175');
  await expect(page.getByText('30歳')).toBeVisible();

  // 設計書の計算例：BMR 1,699 → 消費 2,633 → 目標 2,106、P150 F47 C271
  await expect(result(page)).toContainText('1,699 kcal');
  await expect(result(page)).toContainText('Mifflin-St Jeor式（男性）：10×75 ＋ 6.25×175 − 5×30 ＋ 5');
  await expect(result(page)).toContainText('2,633 kcal');
  await expect(result(page)).toContainText('2,106 kcal');
  await expect(result(page)).toContainText('527 kcal 減らす');
  const pfc = result(page).locator('table tbody tr');
  await expect(pfc.nth(0)).toContainText('150 g');
  await expect(pfc.nth(1)).toContainText('47 g');
  await expect(pfc.nth(2)).toContainText('271 g');
  await expect(page.getByText('✓ プロフィールに保存しました')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/31-settings-plan.png', fullPage: true });

  // 再読み込みしても残る（体重は保存しない）
  await page.reload();
  await expect(page.getByLabel('身長')).toHaveValue('175');
  await expect(page.getByLabel('性別')).toHaveValue('male');
  await expect(result(page)).toContainText('2,106 kcal');
  expect(errors).toEqual([]);
});

test('目安計算：基礎代謝の入力・警告・入力チェック', async ({ page }) => {
  await page.goto('/settings');
  const bmr = page.getByLabel('基礎代謝（任意）');
  await bmr.fill('1800');
  await expect(result(page)).toContainText('入力した値');
  await expect(result(page)).toContainText('2,232 kcal'); // 1800×1.55=2790 → ×0.8

  // 目標が基礎代謝を下回ると警告
  await page.getByLabel('活動レベル').selectOption('1.2');
  await expect(result(page)).toContainText('1,728 kcal');
  await expect(result(page).getByRole('note')).toContainText('基礎代謝を下回っています');

  // 範囲外は計算せずエラー表示（保存もしない）
  await page.getByLabel('たんぱく質', { exact: true }).fill('5');
  await expect(page.getByRole('alert')).toContainText('たんぱく質：1〜3の範囲で入力してください');
  await expect(result(page)).toContainText('入力内容を確認してください');

  // 元に戻す
  await page.getByLabel('たんぱく質', { exact: true }).fill('2.0');
  await page.getByLabel('活動レベル').selectOption('1.55');
  await bmr.fill('');
  await expect(result(page)).toContainText('2,106 kcal');
  // 元の値に戻ったので、保存されている内容も元のまま
  await expect
    .poll(async () => (await (await page.request.get('/api/profile')).json()) as Record<string, unknown>)
    .toMatchObject({ bmrKcal: null, activityLevel: 1.55, proteinPerKg: 2 });
  await page.reload();
  await expect(page.getByLabel('基礎代謝（任意）')).toHaveValue('');
  await expect(page.getByLabel('活動レベル')).toHaveValue('1.55');
});

test('目標：目安を入れて保存 → 記録画面・ホームに反映', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/settings');
  await expect(result(page)).toContainText('2,106 kcal');
  await page.getByRole('button', { name: 'この値を目標に入れる' }).click();
  await expect(page.locator('#goal-kcal')).toHaveValue('2106');
  await expect(page.locator('#goal-proteinG')).toHaveValue('150');
  await expect(page.locator('#goal-fatG')).toHaveValue('47');
  await expect(page.locator('#goal-carbsG')).toHaveValue('271');
  await expect(page.locator('#goal-startDate')).toHaveValue(T);

  // 入力チェック
  await page.locator('#goal-kcal').fill('500');
  await page.locator('#goal-targetDate').fill(addDays(T, -1));
  await page.getByRole('button', { name: '目標を保存' }).click();
  await expect(page.getByRole('alert')).toContainText('カロリー：800〜6000の範囲で入力してください');
  await expect(page.getByRole('alert')).toContainText('目標期日：目標期日は適用開始日より後の日にしてください');

  await page.locator('#goal-kcal').fill('2106');
  // 手で修正できる。P・F・C との差は参考表示
  await page.locator('#goal-proteinG').fill('160');
  await expect(page.getByText('P・F・C から計算すると 2,147 kcal です')).toBeVisible();
  await page.locator('#goal-proteinG').fill('150');
  await page.locator('#goal-targetWeightKg').fill('70');
  await page.locator('#goal-targetBodyFatPct').fill('12');
  await page.locator('#goal-targetDate').fill(TARGET_DATE);
  await page.getByRole('button', { name: '目標を保存' }).click();
  await expect(page.getByRole('status')).toContainText('目標を保存しました');
  const row = page.locator('table.goals-table tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('2,106');
  await expect(row).toContainText('70kg・12%');
  await expect(row).toContainText('適用中');

  // 記録画面の達成率
  await page.goto(`/record/${T}`);
  await expect(page.locator('.daily-total')).toContainText('/ 2,106');

  // ホーム：目標までの残りとペース
  await page.goto('/');
  await expect(page.locator('.intake')).toContainText('/ 2,106');
  // 7日平均 75.3kg（75.6〜75.0）→ 目標 70kg
  await expect(page.getByTestId('goal-weight')).toContainText('あと -5.3kg');
  await expect(page.getByTestId('goal-bodyfat')).toContainText('あと -6.0pt');
  await expect(page.getByTestId('goal-date')).toContainText('あと 140日');
  // 2週間で 1.4kg 減 → 週 -0.70kg（約 -0.9%）
  await expect(page.getByTestId('pace')).toContainText('週 -0.70kg');
  await expect(page.getByTestId('pace')).toContainText('目安どおり');
  await page.screenshot({ path: 'test-results/shots/32-home-goal.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('目標：同じ開始日は確認して上書き、未来の目標は「予定」、削除できる', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('#goal-kcal').fill('2200');
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.accept();
  });
  await page.getByRole('button', { name: '目標を保存' }).click();
  await expect.poll(() => message).toContain('上書きしますか');
  await expect(page.locator('table.goals-table tbody tr')).toHaveCount(1);
  await expect(page.locator('table.goals-table tbody tr')).toContainText('2,200');

  await page.locator('#goal-startDate').fill(addDays(T, 7));
  await page.locator('#goal-kcal').fill('2000');
  await page.getByRole('button', { name: '目標を保存' }).click();
  await expect(page.getByRole('status')).toContainText('目標を保存しました');
  const rows = page.locator('table.goals-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('予定');
  await expect(rows.nth(1)).toContainText('適用中');

  // 読み込んで内容を確認できる
  await rows.nth(1).getByRole('button', { name: /フォームに読み込む/ }).click();
  await expect(page.locator('#goal-startDate')).toHaveValue(T);
  await expect(page.locator('#goal-kcal')).toHaveValue('2200');

  page.once('dialog', (d) => void d.accept());
  await rows.nth(0).getByRole('button', { name: /削除/ }).click();
  await expect(page.getByRole('status')).toHaveText('目標を削除しました');
  await expect(rows).toHaveCount(1);
});

test('スマホ幅：目標・設定とホームがはみ出さない', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  for (const path of ['/settings', '/']) {
    await page.goto(`http://127.0.0.1:3200${path}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} で横にはみ出しています`).toBeLessThanOrEqual(0);
  }
  await page.goto('http://127.0.0.1:3200/settings');
  await expect(page.locator('.plan-result')).toContainText('kcal');
  await page.screenshot({ path: 'test-results/shots/33-mobile-settings.png', fullPage: true });
  await page.goto('http://127.0.0.1:3200/');
  await page.screenshot({ path: 'test-results/shots/34-mobile-home.png', fullPage: true });
  await ctx.close();
});
