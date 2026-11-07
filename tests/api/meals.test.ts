import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { nowIso, openDb, type Db } from '../../src/server/db';
import type { DailyStat, Dashboard, DayMeals, MealEntry } from '../../src/shared/types';

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

const base: Record<string, unknown> = {
  date: '2026-11-08',
  mealType: 'breakfast',
  foodName: 'オートミール',
  amountNote: '40g',
  foodId: null,
  multiplier: null,
  kcal: 150,
  proteinG: 5.4,
  fatG: 2.3,
  carbsG: 27.6,
  memo: null,
};

async function add(over: Record<string, unknown> = {}) {
  const res = await app.inject({ method: 'POST', url: '/api/meals', payload: { ...base, ...over } });
  return res;
}

const day = async (date = '2026-11-08') => (await app.inject(`/api/meals?date=${date}`)).json() as DayMeals;

function insertGoal(startDate: string, kcal: number) {
  db.prepare(
    `INSERT INTO goals (start_date, kcal, protein_g, fat_g, carbs_g, target_weight_kg, created_at) VALUES (?, ?, 150, 47, 271, 70, ?)`,
  ).run(startDate, kcal, nowIso());
}

describe('食事 API', () => {
  it('追加すると 201 で返り、値が丸められる', async () => {
    const res = await add({ kcal: 150.4, proteinG: 5.44 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: 1, mealType: 'breakfast', sortOrder: 0, kcal: 150, proteinG: 5.4, amountNote: '40g' });
  });

  it('kcal を省略すると PFC から計算する', async () => {
    const res = await add({ kcal: null, proteinG: 10, fatG: 5, carbsG: 20 });
    expect(res.json().kcal).toBe(165);
  });

  it('入力チェック：食品名なし・負の値・区分なし・PFC 未入力', async () => {
    expect((await add({ foodName: '  ' })).statusCode).toBe(400);
    expect((await add({ proteinG: -1 })).statusCode).toBe(400);
    expect((await add({ mealType: 'snack' })).statusCode).toBe(400);
    expect((await add({ kcal: 6000 })).statusCode).toBe(400);
    const res = await app.inject({ method: 'POST', url: '/api/meals', payload: { ...base, carbsG: undefined } });
    expect(res.statusCode).toBe(400);
  });

  it('存在しない食品IDは 400', async () => {
    expect((await add({ foodId: 999 })).statusCode).toBe(400);
  });

  it('1日分：区分順に並び、小計と合計が出る', async () => {
    await add({ mealType: 'dinner', foodName: '鶏むね', kcal: 200, proteinG: 40, fatG: 3, carbsG: 0 });
    await add();
    await add({ foodName: '卵', amountNote: '2個', kcal: 160, proteinG: 12.4, fatG: 10.2, carbsG: 0.4 });
    await add({ mealType: 'other', foodName: 'プロテイン', kcal: 120, proteinG: 24, fatG: 1, carbsG: 3 });
    await add({ date: '2026-11-09', foodName: '別の日' });

    const d = await day();
    expect(d.entries.map((e) => e.foodName)).toEqual(['オートミール', '卵', '鶏むね', 'プロテイン']);
    expect(d.entries.map((e) => e.sortOrder)).toEqual([0, 1, 0, 0]);
    expect(d.subtotals.breakfast).toEqual({ kcal: 310, proteinG: 17.8, fatG: 12.5, carbsG: 28 });
    expect(d.subtotals.lunch).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 });
    expect(d.total).toEqual({ kcal: 630, proteinG: 81.8, fatG: 16.5, carbsG: 31 });
    expect(d.goal).toBeNull();
  });

  it('その日の目標が付く（開始日以降のみ）', async () => {
    insertGoal('2026-11-08', 2106);
    insertGoal('2026-11-20', 2000);
    expect((await day('2026-11-07')).goal).toBeNull();
    expect((await day('2026-11-08')).goal).toMatchObject({ kcal: 2106, proteinG: 150 });
    expect((await day('2026-11-25')).goal).toMatchObject({ kcal: 2000 });
  });

  it('更新：区分を変えると移動先の末尾に並ぶ', async () => {
    await add({ mealType: 'lunch', foodName: 'A' });
    const b = (await add({ foodName: 'B' })).json() as MealEntry;
    const res = await app.inject({ method: 'PUT', url: `/api/meals/${b.id}`, payload: { ...base, foodName: 'B2', mealType: 'lunch' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ foodName: 'B2', mealType: 'lunch', sortOrder: 1 });
    expect((await app.inject({ method: 'PUT', url: '/api/meals/999', payload: base })).statusCode).toBe(404);
  });

  it('削除', async () => {
    const e = (await add()).json() as MealEntry;
    expect((await app.inject({ method: 'DELETE', url: `/api/meals/${e.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/meals/${e.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/meals/abc' })).statusCode).toBe(400);
    expect((await day()).entries).toHaveLength(0);
  });
});

describe('食事の集計', () => {
  it('日別：食事のある日は合計、ない日は null。目標は日ごとに切り替わる', async () => {
    insertGoal('2026-11-08', 2106);
    await add({ date: '2026-11-07', kcal: 500, proteinG: 30, fatG: 10, carbsG: 70 });
    await add({ date: '2026-11-09', kcal: 300, proteinG: 20, fatG: 5, carbsG: 40 });
    await add({ date: '2026-11-09', kcal: 200, proteinG: 10, fatG: 5, carbsG: 25 });
    const days = (await app.inject('/api/stats/daily?from=2026-11-07&to=2026-11-09')).json() as DailyStat[];
    expect(days[0]).toMatchObject({ kcal: 500, mealCount: 1, goalKcal: null });
    expect(days[1]).toMatchObject({ kcal: null, proteinG: null, mealCount: 0, goalKcal: 2106 });
    expect(days[2]).toMatchObject({ kcal: 500, proteinG: 30, fatG: 10, carbsG: 65, mealCount: 2, goalKcal: 2106, goalWeightKg: 70 });
  });

  it('ダッシュボードに今日の摂取合計と目標が入る', async () => {
    insertGoal('2026-11-01', 2106);
    await add();
    await add({ mealType: 'lunch', kcal: 600, proteinG: 40, fatG: 15, carbsG: 70 });
    const d = (await app.inject('/api/dashboard?date=2026-11-08')).json() as Dashboard;
    expect(d.intake).toEqual({ kcal: 750, proteinG: 45.4, fatG: 17.3, carbsG: 97.6, count: 2 });
    expect(d.goal).toMatchObject({ kcal: 2106 });
  });
});
