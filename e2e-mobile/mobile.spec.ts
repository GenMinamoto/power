import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { today } from '../src/shared/date';

// スマホ版：1 つの端末（ブラウザの保存領域）を順番に使うので、同じページで直列に実行する
test.describe.configure({ mode: 'serial' });

const T = today();
const D = '2026-11-20';
const ORIGIN = 'http://127.0.0.1:3300/power/';

let context: BrowserContext;
let page: Page;
/** コンソールのエラー・ページの例外・CSP の違反（どのテストで起きたか付き） */
const errors: string[] = [];
/** ページが行ったすべての通信先 */
const requests: string[] = [];
/** 400 以上が返った通信 */
const failed: { status: number; type: string }[] = [];
let current = '';

test.beforeEach(({}, info) => {
  current = info.title;
});

function watch(p: Page) {
  p.on('console', (m) => m.type() === 'error' && errors.push(`${current}: ${m.text()}`));
  p.on('pageerror', (e) => errors.push(`${current}: ${e.message}`));
  p.on('dialog', (d) => void d.accept());
  p.on('response', (r) => r.status() >= 400 && failed.push({ status: r.status(), type: r.request().resourceType() }));
}

async function newDevice(browser: Browser, info: TestInfo): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...info.project.use, baseURL: ORIGIN });
  await ctx.addInitScript(() => {
    // テストでは共有シート（OS の画面）を出さず、ダウンロードで書き出す
    Object.defineProperty(navigator, 'canShare', { value: undefined });
    // CSP で拒否されたもの（外部への通信、eval など）はすべてエラーとして記録する
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(`CSP 違反：${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  // Service Worker の通信も含めて記録する
  ctx.on('request', (r) => requests.push(r.url()));
  return ctx;
}

test.beforeAll(async ({ browser }, info) => {
  context = await newDevice(browser, info);
  page = await context.newPage();
  watch(page);
});

test.afterAll(async () => {
  await context.close();
});

test('初回：ホームが表示され、下のメニューで移動できる。横にはみ出さない', async () => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: '今日の記録へ →' })).toBeVisible();
  await expect(page.getByText('体脂肪率がまだ記録されていません。')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'メニュー' });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box!.y + box!.height).toBeGreaterThan(page.viewportSize()!.height - 2); // 画面の下端
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/shots/m01-home.png', fullPage: true, caret: 'initial' });

  await nav.getByRole('link', { name: 'グラフ' }).tap();
  await expect(page).toHaveURL(`${ORIGIN}charts`);
  await expect(page.getByRole('heading', { name: 'グラフ', level: 1 })).toBeVisible();
});

test('記録：体重と食事を保存し、再読み込み・開き直しても残る', async () => {
  await page.goto(`record/${D}`);
  await page.getByLabel('体重').fill('75.4');
  await page.getByLabel('体脂肪率（2週間に1回）').fill('18.2');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await expect(page.getByRole('status')).toHaveText('保存しました');

  await page.locator('#add-breakfast-name').fill('オートミール');
  await page.keyboard.press('Tab');
  await page.keyboard.type('40g');
  await page.keyboard.press('Tab');
  await page.keyboard.type('150');
  await page.keyboard.press('Tab');
  await page.keyboard.type('5.4');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2.3');
  await page.keyboard.press('Tab');
  await page.keyboard.type('27.6');
  await page.keyboard.press('Enter');
  await expect(page.locator('.meal-row')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/shots/m02-record.png', fullPage: true, caret: 'initial' });

  // 保存が終わってから返事をするので、すぐ再読み込みしても消えない
  await page.reload();
  await expect(page.getByLabel('体重')).toHaveValue('75.4');
  await expect(page.locator('.meal-row')).toHaveCount(1);

  // 別のタブで開いても同じデータ（端末内に保存されている）
  const other = await context.newPage();
  await other.goto(`record/${D}`);
  await expect(other.getByLabel('体重')).toHaveValue('75.4');
  await other.close();
});

test('直接 URL を開いても表示できる（GitHub Pages の 404.html 経由）', async () => {
  const fresh = await context.newPage();
  // Service Worker を通さず、サーバーからの応答を確かめる
  const res = await fetch(`${ORIGIN}history`);
  expect(res.status).toBe(404);
  expect(await res.text()).toContain('<div id="root">');
  await fresh.goto('history');
  await expect(fresh.getByRole('heading', { name: '履歴', level: 1 })).toBeVisible();
  await fresh.close();
});

test('電波がなくても開けて、記録できる', async () => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Service Worker が画面を管理するまで待つ
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller != null)).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto(`record/${D}`);
    await expect(page.getByLabel('体重')).toHaveValue('75.4');
    await page.getByLabel('体重').fill('75.0');
    await page.getByRole('button', { name: '保存', exact: true }).tap();
    await expect(page.getByRole('status')).toHaveText('保存しました');
    await page.reload();
    await expect(page.getByLabel('体重')).toHaveValue('75');
  } finally {
    await context.setOffline(false);
  }
});

let exportedPath = '';

test('エクスポート：全データを JSON で書き出し、最終エクスポート日時が出る', async () => {
  await page.goto('settings');
  await expect(page.getByText('データはこのスマホの中')).toBeVisible();
  await expect(page.getByText('まだエクスポートしていません')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'エクスポート' }).tap()]);
  expect(download.suggestedFilename()).toBe(`power-export-${T.replaceAll('-', '')}.json`);
  exportedPath = 'test-results/mobile/e2e-export.json';
  await download.saveAs(exportedPath);
  const data = JSON.parse(readFileSync(exportedPath, 'utf8'));
  expect(data).toMatchObject({ app: 'power', version: 1, bodyLogs: [{ date: D, weightKg: 75 }] });
  expect(data.mealEntries).toHaveLength(1);
  await expect(page.getByText(/最終エクスポート：/)).toBeVisible();
});

test('バックアップ：今すぐバックアップ → 変更 → その時点に戻せる', async () => {
  await page.goto('settings');
  await page.getByRole('button', { name: '今すぐバックアップ' }).tap();
  await expect(page.getByText(/バックアップしました/)).toBeVisible();

  await page.goto(`record/2026-11-21`);
  await page.getByLabel('体重').fill('74.8');
  await page.getByRole('button', { name: '保存', exact: true }).tap();
  await expect(page.getByRole('status')).toHaveText('保存しました');

  await page.goto('settings');
  await page.getByText(/スマホ内のバックアップから戻す/).tap();
  await page.screenshot({ path: 'test-results/shots/m03-settings-data.png', fullPage: true, caret: 'initial' });
  await page.getByRole('button', { name: 'この時点に戻す' }).first().tap();
  await expect(page.getByText(/の状態に戻しました/)).toBeVisible();

  await page.goto(`record/2026-11-21`);
  await expect(page.getByLabel('体重')).toHaveValue('');
  await page.goto(`record/${D}`);
  await expect(page.getByLabel('体重')).toHaveValue('75');
});

test('ホーム：エクスポートしてから 7 日たつと知らせる', async () => {
  await page.evaluate(() => localStorage.setItem('power.lastExportAt', new Date(Date.now() - 8 * 86_400_000).toISOString()));
  await page.goto('./');
  await expect(page.getByText('最後のエクスポートから8日たちました。')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('power.lastExportAt', new Date().toISOString()));
  await page.reload();
  await expect(page.getByRole('link', { name: '今日の記録へ →' })).toBeVisible();
  await expect(page.getByText(/最後のエクスポートから/)).toHaveCount(0);
});

test('インポート：別の端末（空の状態）にエクスポートしたファイルを読み込める', async ({ browser }, info) => {
  const ctx = await newDevice(browser, info);
  const p = await ctx.newPage();
  watch(p);
  await p.goto(`record/${D}`);
  await expect(p.getByLabel('体重')).toHaveValue('');

  await p.goto('settings');
  await p.getByLabel('インポートするファイル').setInputFiles(exportedPath);
  await expect(p.getByText(/読み込みました：体組成 1件/)).toBeVisible();
  await p.goto(`record/${D}`);
  await expect(p.getByLabel('体重')).toHaveValue('75');
  await expect(p.locator('.meal-row')).toHaveCount(1);
  await ctx.close();
});

test('運動：消費を空欄にすると体重から計算し、目標への上乗せを表示する', async () => {
  await page.goto(`record/${D}`);
  await expect(page.getByLabel('体重')).toHaveValue('75');
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: '運動' }) });

  // ランニング 5km・30分 → 75kg × 5km = 375kcal
  await card.getByLabel('時間（分）').fill('30');
  await card.getByLabel('距離（km）').fill('5');
  await card.getByRole('button', { name: '追加' }).tap();
  await expect(card.locator('.workout-row')).toHaveCount(1);
  await expect(card.locator('.workout-row').first()).toContainText('375');

  // 筋トレ 45分 → (5 − 1) × 75 × 0.75 = 225kcal。名前は種目に合わせて変わる
  await card.getByLabel('種目').selectOption('strength');
  await expect(card.getByLabel('名前')).toHaveValue('筋トレ');
  await card.getByLabel('時間（分）').fill('45');
  await card.getByRole('button', { name: '追加' }).tap();
  await expect(card.locator('.workout-row')).toHaveCount(2);
  await expect(card.locator('.workout-row').nth(1)).toContainText('225');

  // 600kcal × (1 − 20%) = 480kcal を上乗せ
  await expect(card.getByText(/運動 600kcal → 目標に/)).toContainText('+480kcal（炭水化物 +120g）');

  // 筋トレで時間がないと計算できない
  await card.getByLabel('種目').selectOption('strength');
  await card.getByRole('button', { name: '追加' }).tap();
  await expect(card.getByText(/時間か距離がないため/)).toBeVisible();
});

test('運動：ヘルスケアの内容（ショートカットがコピーしたもの）を取り込み、もう一度取り込むと上書き', async () => {
  await page.goto(`record/${D}`);
  const card = page.locator('.card').filter({ has: page.getByRole('heading', { name: '運動' }) });
  await expect(card.getByRole('link', { name: '① ショートカットを実行' })).toHaveAttribute(
    'href',
    'shortcuts://run-shortcut?name=Power%E5%8F%96%E3%82%8A%E8%BE%BC%E3%81%BF',
  );

  await card.getByRole('button', { name: '手で貼り付ける' }).tap();
  await card.getByLabel('コピーした内容を貼り付け').fill(`power date=${D} kind=run kcal=352.4 km=5.2 min=31.5`);
  await card.getByRole('button', { name: '読み取る' }).tap();
  await expect(card.getByRole('region', { name: '取り込む内容' })).toContainText('ランニング（ヘルスケア） 352kcal');
  await card.getByRole('button', { name: 'この内容で保存' }).tap();
  await expect(page.getByRole('status')).toHaveText('取り込みました');
  const healthRows = card.locator('.workout-row').filter({ hasText: 'ヘルスケア' });
  await expect(healthRows).toHaveCount(1);
  await expect(healthRows.first()).toContainText('32分・5.2km');
  await page.screenshot({ path: 'test-results/shots/m04-workouts.png', fullPage: true, caret: 'initial' });

  // 保存すると貼り付け欄は閉じる
  await expect(card.getByLabel('コピーした内容を貼り付け')).toHaveCount(0);
  await card.getByRole('button', { name: '手で貼り付ける' }).tap();
  await card.getByLabel('コピーした内容を貼り付け').fill(`power date=${D} kind=run kcal=400`);
  await card.getByRole('button', { name: '読み取る' }).tap();
  await card.getByRole('button', { name: 'この内容で保存' }).tap();
  await expect(page.getByRole('status')).toHaveText('取り込みました（1件は前回の取り込みを上書き）');
  await expect(healthRows).toHaveCount(1);
  await expect(healthRows.first()).toContainText('400');

  // 読み取れない内容
  await card.getByRole('button', { name: '手で貼り付ける' }).tap();
  await card.getByLabel('コピーした内容を貼り付け').fill('こんにちは');
  await card.getByRole('button', { name: '読み取る' }).tap();
  await expect(card.getByText(/Power 用の内容が見つかりません/)).toBeVisible();
});

test('目標・設定：活動レベルが ×1.2 でなければ知らせ、ボタンで ×1.2 にできる', async () => {
  await page.goto('settings');
  await expect(page.getByText(/運動は記録画面の「運動」から足す方式です/)).toBeVisible();
  await page.getByRole('button', { name: '×1.2 にする' }).tap();
  await expect(page.getByLabel('活動レベル')).toHaveValue('1.2');
  await expect(page.getByText('運動した日は、記録画面の「運動」の分が目標に上乗せされます')).toBeVisible();
  // 自動で保存される
  await page.waitForTimeout(1000);
  await page.reload();
  await expect(page.getByLabel('活動レベル')).toHaveValue('1.2');
});

test('安全性：自分のサイト以外とは一切通信しておらず、エラーも出ていない', async () => {
  // ネットワークの通信（http/https/ws）だけを見る。ブラウザ自身の画面（edge://downloads など）は対象外
  const network = requests.filter((u) => /^(https?|wss?):/.test(u));
  const outside = network.filter((u) => !u.startsWith(ORIGIN));
  expect(outside).toEqual([]);
  expect(network.length).toBeGreaterThan(5);
  // 404 になってよいのは「直接開いた URL」だけ（GitHub Pages が 404.html で画面を返す）。ファイルの読み込み失敗はなし
  expect(failed.filter((f) => !(f.status === 404 && f.type === 'document'))).toEqual([]);
  // CSP の違反（外部への通信を拒否した場合など）もコンソールのエラーとして出る
  expect(errors.filter((e) => !/status of 404 \(Not Found\)$/.test(e))).toEqual([]);
});
