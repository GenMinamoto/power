import { expect, test, type Page } from '@playwright/test';
import { today } from '../src/shared/date';

test.describe.configure({ mode: 'serial' });

const T = today();
const D = '2026-09-10';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const section = (page: Page, title: string) => page.locator('section.meal-section').filter({ has: page.getByRole('heading', { name: title }) });

/** キーボードだけで 1 品追加する（kcal 空欄なら PFC から自動計算） */
async function addByKeyboard(
  page: Page,
  meal: 'breakfast' | 'lunch' | 'dinner' | 'other',
  v: { name: string; amount?: string; kcal?: string; p: string; f: string; c: string },
) {
  await page.locator(`#add-${meal}-name`).click();
  await page.keyboard.type(v.name);
  await page.keyboard.press('Tab');
  await page.keyboard.type(v.amount ?? '');
  await page.keyboard.press('Tab');
  await page.keyboard.type(v.kcal ?? '');
  await page.keyboard.press('Tab');
  await page.keyboard.type(v.p);
  await page.keyboard.press('Tab');
  await page.keyboard.type(v.f);
  await page.keyboard.press('Tab');
  await page.keyboard.type(v.c);
  await page.keyboard.press('Enter');
}

test('食事：キーボードだけで追加でき、kcal 空欄は PFC から計算される', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/record/${D}`);
  await addByKeyboard(page, 'breakfast', { name: 'オートミール', amount: '40g', kcal: '150', p: '5.4', f: '2.3', c: '27.6' });

  const bf = section(page, '朝食');
  await expect(bf.locator('.meal-row')).toHaveCount(1);
  await expect(bf.locator('.meal-row').first()).toContainText('オートミール 40g');
  // 追加後は入力欄が空になり、食品名に戻る（連続入力）
  await expect(page.locator('#add-breakfast-name')).toHaveValue('');
  await expect(page.locator('#add-breakfast-name')).toBeFocused();

  // 続けて kcal 空欄で追加 → 12.4*4 + 10.2*9 + 0.4*4 = 143
  await page.keyboard.type('卵');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2個');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('12.4');
  await page.keyboard.press('Tab');
  await page.keyboard.type('10.2');
  await page.keyboard.press('Tab');
  await page.keyboard.type('0.4');
  await page.keyboard.press('Enter');

  await expect(bf.locator('.meal-row')).toHaveCount(2);
  await expect(bf.locator('.meal-row').nth(1)).toContainText('143kcal');
  await expect(bf.getByText('小計')).toContainText('293kcal');
  expect(errors).toEqual([]);
});

test('食事：区分ごとに追加でき、1日合計が出る。再読み込みしても残る', async ({ page }) => {
  await page.goto(`/record/${D}`);
  await addByKeyboard(page, 'lunch', { name: '鶏むね定食', kcal: '650', p: '45', f: '15', c: '80' });
  await addByKeyboard(page, 'dinner', { name: '鮭', amount: '1切れ', kcal: '200', p: '22', f: '12', c: '0' });
  await addByKeyboard(page, 'other', { name: 'プロテイン', kcal: '120', p: '24', f: '1', c: '3' });
  await expect(section(page, 'その他').locator('.meal-row')).toHaveCount(1);

  await page.reload();
  for (const [title, n] of [['朝食', 2], ['昼食', 1], ['夕食', 1], ['その他', 1]] as const) {
    await expect(section(page, title).locator('.meal-row')).toHaveCount(n);
  }
  // 合計：150+143+650+200+120 = 1263kcal、P 5.4+12.4+45+22+24 = 108.8 → 109
  const total = page.locator('.daily-total');
  await expect(total.locator('.intake-row').nth(0)).toContainText('1,263');
  await expect(total.locator('.intake-row').nth(1)).toContainText('109');
  await expect(total.getByText('目標を設定すると達成率が表示されます')).toBeVisible();
});

test('食事：入力チェック', async ({ page }) => {
  await page.goto(`/record/${D}`);
  const form = section(page, '昼食').locator('form.meal-form').last();
  await form.getByRole('button', { name: '追加' }).click();
  await expect(form.getByRole('alert')).toContainText('食品名：食品名を入力してください');
  await expect(form.getByRole('alert')).toContainText('P：入力してください');

  await page.locator('#add-lunch-name').fill('テスト');
  await page.locator('#add-lunch-proteinG').fill('-1');
  await page.locator('#add-lunch-fatG').fill('abc');
  await page.locator('#add-lunch-carbsG').fill('10');
  await form.getByRole('button', { name: '追加' }).click();
  await expect(form.getByRole('alert')).toContainText('P：0〜500の範囲で入力してください');
  await expect(form.getByRole('alert')).toContainText('F：');
  await expect(section(page, '昼食').locator('.meal-row')).toHaveCount(1);
});

test('食事：kcal と PFC が大きくずれると注意マークが出る', async ({ page }) => {
  await page.goto(`/record/${D}`);
  await addByKeyboard(page, 'other', { name: 'ずれ', kcal: '500', p: '10', f: '5', c: '20' });
  const row = section(page, 'その他').locator('.meal-row').filter({ hasText: 'ずれ' });
  await expect(row.getByLabel('kcal と PFC が合っていません')).toBeVisible();
  await expect(row.locator('.mismatch')).toHaveAttribute('title', /165kcal/);
});

test('食事：編集（Esc でキャンセル、保存で反映）', async ({ page }) => {
  await page.goto(`/record/${D}`);
  const other = section(page, 'その他');
  await other.getByRole('button', { name: 'ずれを編集' }).click();
  await expect(page.locator('#edit-' + (await editId(page)) + '-name')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(other.locator('form.editing')).toHaveCount(0);

  await other.getByRole('button', { name: 'ずれを編集' }).click();
  const id = await editId(page);
  await page.locator(`#edit-${id}-name`).fill('修正済み');
  await page.locator(`#edit-${id}-kcal`).fill('');
  await page.locator(`#edit-${id}-kcal`).press('Enter');
  await expect(page.getByRole('status')).toHaveText('保存しました');
  const row = other.locator('.meal-row').filter({ hasText: '修正済み' });
  await expect(row).toContainText('165kcal');
  await expect(row.locator('.mismatch')).toHaveCount(0);
});

async function editId(page: Page): Promise<string> {
  const idAttr = await page.locator('form.meal-form.editing input').first().getAttribute('id');
  return idAttr!.replace(/^edit-/, '').replace(/-name$/, '');
}

test('食事：削除（確認ダイアログ）', async ({ page }) => {
  await page.goto(`/record/${D}`);
  const other = section(page, 'その他');
  await expect(other.locator('.meal-row')).toHaveCount(2);
  page.once('dialog', (d) => void d.dismiss());
  await other.getByRole('button', { name: '修正済みを削除' }).click();
  await expect(other.locator('.meal-row')).toHaveCount(2);
  page.once('dialog', (d) => void d.accept());
  await other.getByRole('button', { name: '修正済みを削除' }).click();
  await expect(page.getByRole('status')).toHaveText('削除しました');
  await expect(other.locator('.meal-row')).toHaveCount(1);
});

test('食事：1品 1500kcal 超は確認が出る', async ({ page }) => {
  await page.goto(`/record/${D}`);
  page.once('dialog', (d) => {
    expect(d.message()).toContain('2000kcal');
    void d.dismiss();
  });
  await addByKeyboard(page, 'dinner', { name: '大盛り', kcal: '2000', p: '50', f: '80', c: '250' });
  await expect(page.locator('#add-dinner-name')).toHaveValue('大盛り'); // キャンセルしたら入力は残る
  await expect(section(page, '夕食').locator('.meal-row')).toHaveCount(1);
});

test('ホーム：今日の摂取合計が出る', async ({ page }) => {
  await page.goto(`/record/${T}`);
  await addByKeyboard(page, 'breakfast', { name: '納豆ご飯', kcal: '400', p: '15', f: '6', c: '70' });
  await expect(section(page, '朝食').locator('.meal-row')).toHaveCount(1);
  await page.goto('/');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: '今日の摂取' }) });
  await expect(card).toContainText('1品');
  await expect(card.locator('.intake-row').first()).toContainText('400');
});

test('グラフ：摂取カロリーと PFC、期間平均の表', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/charts');
  await page.getByRole('button', { name: '全期間' }).click();
  await expect(page.locator('canvas')).toHaveCount(6);
  const table = page.locator('table.pfc-table');
  await expect(table).toContainText('食事を記録した 2 日');
  // 2 日の平均：kcal (1263 + 400) / 2 = 831.5 → 832
  await expect(table.locator('tr').filter({ hasText: 'カロリー' })).toContainText('832 kcal');
  await page.screenshot({ path: 'test-results/shots/11-charts-meals.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('記録画面の見た目（PC・スマホ）', async ({ page, browser }) => {
  await page.goto(`/record/${D}`);
  await page.screenshot({ path: 'test-results/shots/12-record-meals.png', fullPage: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP' });
  const m = await ctx.newPage();
  await m.goto(`http://127.0.0.1:3200/record/${D}`);
  await m.waitForLoadState('networkidle');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await m.screenshot({ path: 'test-results/shots/13-mobile-record-meals.png', fullPage: true });
  await ctx.close();
});
