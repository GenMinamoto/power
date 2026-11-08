import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const D = '2026-08-10';
const D2 = '2026-08-11';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const section = (page: Page, title: string) => page.locator('section.meal-section').filter({ has: page.getByRole('heading', { name: title }) });
const foodRow = (page: Page, name: string) => page.locator('table.foods-table tbody tr').filter({ has: page.getByRole('cell', { name, exact: true }) });

async function registerFood(page: Page, v: { name: string; serving: string; kcal: string; p: string; f: string; c: string }) {
  await page.locator('#new-food-name').fill(v.name);
  await page.locator('#new-food-servingNote').fill(v.serving);
  await page.locator('#new-food-kcal').fill(v.kcal);
  await page.locator('#new-food-proteinG').fill(v.p);
  await page.locator('#new-food-fatG').fill(v.f);
  await page.locator('#new-food-carbsG').fill(v.c);
  await page.locator('#new-food-carbsG').press('Enter');
  await expect(page.getByRole('status')).toHaveText(`「${v.name}」を登録しました`);
}

test('マイ食品：登録（kcal 自動計算）・入力チェック・検索', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/foods');
  await expect(page.getByText('まだ登録がありません。')).toBeVisible();

  await page.getByRole('button', { name: '登録' }).click();
  await expect(page.getByRole('alert')).toContainText('食品名：食品名を入力してください');

  await registerFood(page, { name: '卵', serving: '1個', kcal: '80', p: '6.2', f: '5.1', c: '0.2' });
  // 登録後は空になり、続けて登録できる
  await expect(page.locator('#new-food-name')).toHaveValue('');
  await expect(page.locator('#new-food-name')).toBeFocused();
  // 3.8*4 + 0.5*9 + 55.7*4 = 242.5 → 243
  await registerFood(page, { name: '白米', serving: '150g', kcal: '', p: '3.8', f: '0.5', c: '55.7' });
  await registerFood(page, { name: 'ゆで卵', serving: '1個', kcal: '76', p: '6.5', f: '5.0', c: '0.2' });

  await expect(foodRow(page, '白米')).toContainText('243');
  await expect(page.locator('table.foods-table tbody tr')).toHaveCount(3);

  await page.getByLabel('マイ食品を検索').fill('卵');
  await expect(page.locator('table.foods-table tbody tr')).toHaveCount(2);
  await page.getByLabel('マイ食品を検索').fill('150g');
  await expect(page.locator('table.foods-table tbody tr')).toHaveCount(1);
  await page.getByLabel('マイ食品を検索').fill('');
  await page.screenshot({ path: 'test-results/shots/21-foods.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('マイ食品：編集（Esc でキャンセル、保存）', async ({ page }) => {
  await page.goto('/foods');
  await page.getByRole('button', { name: '白米を編集' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('table.foods-table form')).toHaveCount(0);

  await page.getByRole('button', { name: '白米を編集' }).click();
  const kcal = page.locator('table.foods-table form input[id$="-kcal"]');
  await kcal.fill('252');
  await kcal.press('Enter');
  await expect(page.getByRole('status')).toHaveText('保存しました');
  await expect(foodRow(page, '白米')).toContainText('252');
});

test('食事：候補からキーボードで選び、倍率で再計算して追加', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/record/${D}`);
  const name = page.locator('#add-breakfast-name');
  await name.click();
  await page.keyboard.type('卵');
  const list = page.getByRole('listbox', { name: 'マイ食品の候補' });
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option').first()).toContainText('卵'); // 前方一致が先
  await page.screenshot({ path: 'test-results/shots/22-suggest.png' });

  await page.keyboard.press('Enter'); // 先頭の候補を選ぶ
  await expect(name).toHaveValue('卵');
  await expect(page.locator('#add-breakfast-amount')).toHaveValue('1個');
  await expect(page.locator('#add-breakfast-kcal')).toHaveValue('80');
  const mult = page.locator('#add-breakfast-mult');
  await expect(mult).toBeFocused();
  await expect(mult).toHaveValue('1');

  await page.keyboard.type('2'); // 選択中の「1」を置き換え
  await expect(page.locator('#add-breakfast-kcal')).toHaveValue('160');
  await expect(page.locator('#add-breakfast-proteinG')).toHaveValue('12.4');
  await expect(page.locator('#add-breakfast-fatG')).toHaveValue('10.2');
  await page.keyboard.press('Enter');

  const row = section(page, '朝食').locator('.meal-row').first();
  await expect(row).toContainText('卵 1個 ×2');
  await expect(row).toContainText('160kcal');
  // マイ食品から入れた行には「☆（登録）」が出ない
  await expect(row.getByRole('button', { name: '卵をマイ食品に登録' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('食事：候補をマウスで選ぶ。kcal を手で変えると倍率が使えなくなる', async ({ page }) => {
  await page.goto(`/record/${D}`);
  await page.locator('#add-lunch-name').fill('白');
  await page.getByRole('option', { name: /白米/ }).click();
  await expect(page.locator('#add-lunch-kcal')).toHaveValue('252');
  await expect(page.locator('#add-lunch-mult')).toBeEnabled();
  await expect(section(page, '昼食').getByText('マイ食品', { exact: true })).toBeVisible();

  await page.locator('#add-lunch-mult').fill('1.5');
  await expect(page.locator('#add-lunch-kcal')).toHaveValue('378');

  await page.locator('#add-lunch-kcal').fill('400');
  await expect(page.locator('#add-lunch-mult')).toBeDisabled();
  await expect(page.locator('#add-lunch-mult')).toHaveValue('');
  await expect(section(page, '昼食').getByText('マイ食品', { exact: true })).toHaveCount(0);
  await page.locator('#add-lunch-kcal').press('Enter');

  const row = section(page, '昼食').locator('.meal-row').first();
  await expect(row).toContainText('400kcal');
  await expect(row).not.toContainText('×');
  // 手入力扱いなので ☆ が出る
  await expect(row.getByRole('button', { name: '白米をマイ食品に登録' })).toBeVisible();
});

test('食事：倍率つきの行を編集して倍率を変える', async ({ page }) => {
  await page.goto(`/record/${D}`);
  await section(page, '朝食').getByRole('button', { name: '卵を編集' }).click();
  const mult = page.locator('form.editing input[id$="-mult"]');
  await expect(mult).toHaveValue('2');
  await mult.fill('3');
  await expect(page.locator('form.editing input[id$="-kcal"]')).toHaveValue('240');
  await mult.press('Enter');
  await expect(section(page, '朝食').locator('.meal-row').first()).toContainText('卵 1個 ×3');
  await expect(section(page, '朝食').locator('.meal-row').first()).toContainText('240kcal');
});

test('食事：手入力した行を ☆ でマイ食品に登録（倍率なし）。同名は確認が出る', async ({ page }) => {
  await page.goto(`/record/${D}`);
  const name = page.locator('#add-dinner-name');
  await name.fill('鶏むね');
  await page.keyboard.press('Escape'); // 候補なし（念のため）
  await page.locator('#add-dinner-amount').fill('100g');
  await page.locator('#add-dinner-proteinG').fill('23');
  await page.locator('#add-dinner-fatG').fill('1.9');
  await page.locator('#add-dinner-carbsG').fill('0');
  await page.locator('#add-dinner-carbsG').press('Enter');
  const row = section(page, '夕食').locator('.meal-row').first();
  await expect(row).toContainText('109kcal'); // 92 + 17.1

  await row.getByRole('button', { name: '鶏むねをマイ食品に登録' }).click();
  await expect(page.getByRole('status')).toHaveText('「鶏むね」をマイ食品に登録しました');

  // 同じ名前でもう一度 → 確認ダイアログ（キャンセル）
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await row.getByRole('button', { name: '鶏むねをマイ食品に登録' }).click();
  await expect.poll(() => message).toContain('登録済み');

  await page.goto('/foods');
  await expect(foodRow(page, '鶏むね')).toContainText('100g');
  await expect(foodRow(page, '鶏むね')).toContainText('109');
  // 卵は食事で 1 回使った
  await expect(foodRow(page, '卵').locator('td').nth(6)).toHaveText('1');
});

test('食事のコピー：1日分すべて → 区分指定', async ({ page }) => {
  await page.goto(`/record/${D2}`);
  await page.getByRole('button', { name: '過去の食事をコピー' }).click();
  await expect(page.getByLabel('コピー元の日')).toHaveValue(D);
  await page.getByRole('button', { name: 'コピー', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('8/10 の食事を 3 品コピーしました');
  await expect(section(page, '朝食').locator('.meal-row').first()).toContainText('卵 1個 ×3');
  await expect(section(page, '昼食').locator('.meal-row')).toHaveCount(1);
  await expect(section(page, '夕食').locator('.meal-row')).toHaveCount(1);

  await page.getByRole('button', { name: '過去の食事をコピー' }).click();
  await page.getByLabel('区分').selectOption({ label: '夕食' });
  await page.getByRole('button', { name: 'コピー', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('8/10 の食事を 1 品コピーしました');
  await expect(section(page, '夕食').locator('.meal-row')).toHaveCount(2);
  await expect(section(page, '朝食').locator('.meal-row')).toHaveCount(1);

  // 記録のない日からはコピーできない
  await page.getByRole('button', { name: '過去の食事をコピー' }).click();
  await page.getByLabel('コピー元の日').fill('2026-08-01');
  await page.getByRole('button', { name: 'コピー', exact: true }).click();
  await expect(page.getByText('コピー元の日に食事の記録がありません')).toBeVisible();
});

test('マイ食品を削除しても過去の食事記録は残る', async ({ page }) => {
  await page.goto('/foods');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: '卵を削除', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('削除しました');
  await expect(foodRow(page, '卵')).toHaveCount(0);

  await page.goto(`/record/${D}`);
  const row = section(page, '朝食').locator('.meal-row').first();
  await expect(row).toContainText('卵 1個 ×3');
  await expect(row).toContainText('240kcal');
});

test('スマホ幅：マイ食品と記録画面がはみ出さない', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const page = await ctx.newPage();
  for (const path of ['/foods', `/record/${D}`]) {
    await page.goto(`http://127.0.0.1:3200${path}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} で横にはみ出しています`).toBeLessThanOrEqual(0);
  }
  await page.goto(`http://127.0.0.1:3200/record/${D}`);
  await page.locator('#add-lunch-name').fill('白');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/23-mobile-suggest.png', fullPage: true });
  await page.goto('http://127.0.0.1:3200/foods');
  await page.screenshot({ path: 'test-results/shots/24-mobile-foods.png', fullPage: true });
  await ctx.close();
});
