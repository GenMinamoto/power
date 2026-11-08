import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import type { DayMeals, Food, MealEntry } from '../../src/shared/types';

let app: FastifyInstance;
let db: Db;
let backupDir: string;

beforeEach(async () => {
  db = openDb(':memory:');
  backupDir = mkdtempSync(join(tmpdir(), 'power-test-'));
  app = await buildApp({ db, backupDir });
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(backupDir, { recursive: true, force: true });
});

const egg = { name: '卵', servingNote: '1個', kcal: 80, proteinG: 6.2, fatG: 5.1, carbsG: 0.2 };

async function createFood(over: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/foods', payload: { ...egg, ...over } });
  return res;
}

const list = async (q = '') => (await app.inject(`/api/foods${q ? `?q=${encodeURIComponent(q)}` : ''}`)).json() as Food[];

const meal = (over: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/meals',
    payload: {
      date: '2026-11-08',
      mealType: 'breakfast',
      foodName: '卵',
      amountNote: '1個',
      foodId: null,
      multiplier: null,
      kcal: 80,
      proteinG: 6.2,
      fatG: 5.1,
      carbsG: 0.2,
      memo: null,
      ...over,
    },
  });

describe('マイ食品 API', () => {
  it('登録・取得・kcal 省略時の自動計算', async () => {
    const res = await createFood();
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 1, ...egg, useCount: 0 });
    const r2 = await createFood({ name: 'ささみ', servingNote: null, kcal: null, proteinG: 23, fatG: 0.8, carbsG: 0 });
    expect(r2.json().kcal).toBe(99); // 92 + 7.2
  });

  it('入力チェック', async () => {
    expect((await createFood({ name: '' })).statusCode).toBe(400);
    expect((await createFood({ proteinG: -1 })).statusCode).toBe(400);
    expect((await createFood({ fatG: null })).statusCode).toBe(400);
  });

  it('部分一致検索：前方一致を優先し、次によく使う順', async () => {
    await createFood({ name: 'ゆで卵' });
    await createFood({ name: '卵' });
    await createFood({ name: '白米', servingNote: '150g' });
    await createFood({ name: '卵焼き' });
    // ゆで卵を 2 回、卵焼きを 1 回使う
    await meal({ foodId: 1 });
    await meal({ foodId: 1 });
    await meal({ foodId: 4 });
    expect((await list('卵')).map((f) => f.name)).toEqual(['卵焼き', '卵', 'ゆで卵']);
    expect((await list()).map((f) => f.name)[0]).toBe('ゆで卵');
    expect((await list('150')).map((f) => f.name)).toEqual(['白米']); // 基準量でも検索できる
  });

  it('LIKE の特殊文字をそのまま検索できる', async () => {
    await createFood({ name: '脂質50%カット' });
    await createFood({ name: 'マヨネーズ' });
    expect((await list('%')).map((f) => f.name)).toEqual(['脂質50%カット']);
    expect(await list('_')).toEqual([]);
  });

  it('食事に使うと use_count が増える', async () => {
    await createFood();
    await meal({ foodId: 1, multiplier: 2 });
    expect((await list())[0]!.useCount).toBe(1);
  });

  it('更新しても過去の食事記録は変わらない', async () => {
    await createFood();
    await meal({ foodId: 1, multiplier: 2, kcal: 160 });
    const res = await app.inject({ method: 'PUT', url: '/api/foods/1', payload: { ...egg, kcal: 90 } });
    expect(res.json().kcal).toBe(90);
    const day = (await app.inject('/api/meals?date=2026-11-08')).json() as DayMeals;
    expect(day.entries[0]).toMatchObject({ kcal: 160, foodId: 1 });
    expect((await app.inject({ method: 'PUT', url: '/api/foods/99', payload: egg })).statusCode).toBe(404);
  });

  it('削除しても食事記録は残り、food_id は null になる', async () => {
    await createFood();
    await meal({ foodId: 1 });
    expect((await app.inject({ method: 'DELETE', url: '/api/foods/1' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/api/foods/1' })).statusCode).toBe(404);
    const day = (await app.inject('/api/meals?date=2026-11-08')).json() as DayMeals;
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]!.foodId).toBeNull();
  });
});

describe('食事のコピー API', () => {
  const copy = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/meals/copy', payload });

  it('1日分を全区分コピー。コピー先の既存の行は残り、末尾に追加される', async () => {
    await createFood();
    await meal({ date: '2026-11-07', foodName: '卵', foodId: 1, multiplier: 2, kcal: 160 });
    await meal({ date: '2026-11-07', foodName: '白米', mealType: 'lunch', kcal: 250 });
    await meal({ date: '2026-11-08', foodName: '既存' });
    const res = await copy({ fromDate: '2026-11-07', toDate: '2026-11-08', mealType: null });
    expect(res.json()).toEqual({ copied: 2 });
    const day = (await app.inject('/api/meals?date=2026-11-08')).json() as DayMeals;
    expect(day.entries.map((e: MealEntry) => [e.foodName, e.mealType, e.sortOrder])).toEqual([
      ['既存', 'breakfast', 0],
      ['卵', 'breakfast', 1],
      ['白米', 'lunch', 0],
    ]);
    expect(day.entries[1]).toMatchObject({ foodId: 1, multiplier: 2, kcal: 160 });
    expect(day.total.kcal).toBe(490);
  });

  it('区分を指定してコピー', async () => {
    await meal({ date: '2026-11-07' });
    await meal({ date: '2026-11-07', mealType: 'dinner', foodName: '鮭' });
    const res = await copy({ fromDate: '2026-11-07', toDate: '2026-11-08', mealType: 'dinner' });
    expect(res.json()).toEqual({ copied: 1 });
    const day = (await app.inject('/api/meals?date=2026-11-08')).json() as DayMeals;
    expect(day.entries.map((e) => e.foodName)).toEqual(['鮭']);
  });

  it('コピー元に記録がなければ 404、同じ日は 400', async () => {
    expect((await copy({ fromDate: '2026-11-01', toDate: '2026-11-08', mealType: null })).statusCode).toBe(404);
    await meal();
    expect((await copy({ fromDate: '2026-11-07', toDate: '2026-11-08', mealType: 'lunch' })).statusCode).toBe(404);
    expect((await copy({ fromDate: '2026-11-08', toDate: '2026-11-08', mealType: null })).statusCode).toBe(400);
  });
});
