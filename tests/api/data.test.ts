import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import type { ExportData, ImportResult } from '../../src/server/transfer';
import type { ApiErrorBody, MealEntry, WeeklyStat } from '../../src/shared/types';

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

const body = (date: string, weightKg: number | null, bodyFatPct: number | null = null) =>
  app.inject({ method: 'PUT', url: `/api/body-logs/${date}`, payload: { weightKg, bodyFatPct, memo: null } });

const meal = (date: string, kcal: number, over: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/meals',
    payload: {
      date,
      mealType: 'breakfast',
      foodName: '食事',
      amountNote: null,
      foodId: null,
      multiplier: null,
      kcal,
      proteinG: 10,
      fatG: 5,
      carbsG: 20,
      memo: null,
      ...over,
    },
  });

describe('週次サマリー', () => {
  it('月曜始まりで、記録のある日だけで平均し、前週との差を出す', async () => {
    // 2026-11-02 は月曜
    await body('2026-11-02', 76.0, 18.0);
    await body('2026-11-04', 75.6);
    await body('2026-11-08', 75.5); // 日曜 → 同じ週
    await body('2026-11-09', 75.0); // 次の週の月曜
    await body('2026-11-10', 75.2);
    await meal('2026-11-03', 2000);
    await meal('2026-11-03', 200);
    await meal('2026-11-05', 1900);

    const res = await app.inject('/api/stats/weekly?from=2026-11-04&to=2026-11-10');
    expect(res.statusCode).toBe(200);
    const weeks = res.json<WeeklyStat[]>();
    expect(weeks).toEqual([
      {
        weekStart: '2026-11-02', // from は週の月曜まで広げる
        avgWeightKg: 75.7,
        avgBodyFatPct: 18,
        avgKcal: 2050, // (2200 + 1900) / 2（食事のない日は含めない）
        avgProteinG: 15,
        avgFatG: 7.5,
        avgCarbsG: 30,
        weightDays: 3,
        mealDays: 2,
        diffWeightKg: null,
      },
      {
        weekStart: '2026-11-09',
        avgWeightKg: 75.1,
        avgBodyFatPct: null,
        avgKcal: null,
        avgProteinG: null,
        avgFatG: null,
        avgCarbsG: null,
        weightDays: 2,
        mealDays: 0,
        diffWeightKg: -0.6,
      },
    ]);
  });

  it('記録がなければ空でなく今週 1 行（値は null）', async () => {
    const weeks = (await app.inject('/api/stats/weekly?from=2026-11-04&to=2026-11-04')).json<WeeklyStat[]>();
    expect(weeks).toHaveLength(1);
    expect(weeks[0]).toMatchObject({ weekStart: '2026-11-02', avgWeightKg: null, weightDays: 0 });
  });
});

describe('エクスポート / インポート', () => {
  async function seed() {
    await app.inject({
      method: 'PUT',
      url: '/api/profile',
      payload: { sex: 'female', birthDate: '1990-05-05', heightCm: 160, bmrKcal: null, activityLevel: 1.375, deficitPct: 10, proteinPerKg: 1.8, fatPct: 25 },
    });
    await body('2026-11-01', 60.2, 25.1);
    await body('2026-11-02', 60.0);
    const food = (
      await app.inject({
        method: 'POST',
        url: '/api/foods',
        payload: { name: '卵', servingNote: '1個', kcal: 80, proteinG: 6.2, fatG: 5.1, carbsG: 0.2 },
      })
    ).json<{ id: number }>();
    await meal('2026-11-01', 160, { foodName: '卵', foodId: food.id, multiplier: 2, proteinG: 12.4, fatG: 10.2, carbsG: 0.4 });
    await meal('2026-11-02', 500, { mealType: 'dinner', memo: 'メモ' });
    await app.inject({
      method: 'POST',
      url: '/api/goals',
      payload: { startDate: '2026-11-01', kcal: 1700, proteinG: 110, fatG: 47, carbsG: 200, targetWeightKg: 55, targetBodyFatPct: null, targetDate: null },
    });
  }

  const exportJson = async () => {
    const res = await app.inject('/api/export');
    expect(res.statusCode).toBe(200);
    return { res, data: res.json<ExportData>() };
  };
  const importJson = (payload: unknown) => app.inject({ method: 'POST', url: '/api/import', payload: payload as object });

  it('書き出し → 全削除 → 読み込みで元どおりになる（id・使用回数も）', async () => {
    await seed();
    const { res, data } = await exportJson();
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="power-export-\d{8}\.json"$/);
    expect(data).toMatchObject({ app: 'power', version: 1 });
    expect([data.bodyLogs.length, data.foods.length, data.mealEntries.length, data.goals.length]).toEqual([2, 1, 2, 1]);
    expect(data.foods[0]?.useCount).toBe(1);

    // 別のデータに変えてから読み込む
    await body('2026-11-03', 59.0);
    await app.inject({ method: 'DELETE', url: `/api/foods/${data.foods[0]!.id}` });
    const r = await importJson(data);
    expect(r.statusCode).toBe(200);
    const result = r.json<ImportResult>();
    expect(result.imported).toEqual({ bodyLogs: 2, foods: 1, mealEntries: 2, goals: 1 });
    expect(result.backupFile).toMatch(/-pre-import\.db$/);
    expect(readdirSync(backupDir)).toContain(result.backupFile);

    const again = (await exportJson()).data;
    expect({ ...again, exportedAt: '' }).toEqual({ ...data, exportedAt: '' });
    // 食品とのつながりも戻っている
    const meals = (await app.inject('/api/meals?date=2026-11-01')).json<{ entries: MealEntry[] }>();
    expect(meals.entries[0]).toMatchObject({ foodId: data.foods[0]!.id, multiplier: 2 });
    // 戻した後も新しい記録を追加できる（id が重ならない）
    expect((await meal('2026-11-04', 300)).statusCode).toBe(201);
  });

  it('不正なデータは 400 で、何も変更しない（バックアップも作らない）', async () => {
    await seed();
    const { data } = await exportJson();
    const before = JSON.stringify({ ...data, exportedAt: '' });

    const cases: [string, unknown][] = [
      ['別アプリ', { ...data, app: 'other' }],
      ['未対応の版', { ...data, version: 2 }],
      ['範囲外の体重', { ...data, bodyLogs: [{ ...data.bodyLogs[0]!, weightKg: 999 }] }],
      ['日付の重複', { ...data, bodyLogs: [data.bodyLogs[0], data.bodyLogs[0]] }],
      ['存在しない食品', { ...data, foods: [] }],
      ['配列がない', { ...data, goals: undefined }],
    ];
    for (const [label, payload] of cases) {
      const res = await importJson(payload);
      expect(res.statusCode, label).toBe(400);
    }
    const r = await importJson({ ...data, foods: [] });
    expect(r.json<ApiErrorBody>().error.details?.[0]).toEqual({ path: 'mealEntries.0.foodId', message: '存在しない食品を参照しています' });

    expect(JSON.stringify({ ...(await exportJson()).data, exportedAt: '' })).toBe(before);
    expect(readdirSync(backupDir).filter((f) => f.includes('pre-import'))).toEqual([]);
  });

  it('空のデータを読み込むと全削除になる', async () => {
    await seed();
    const { data } = await exportJson();
    const r = await importJson({ ...data, bodyLogs: [], foods: [], mealEntries: [], goals: [] });
    expect(r.statusCode).toBe(200);
    expect((await app.inject('/api/body-logs')).json()).toEqual([]);
    expect((await app.inject('/api/goals')).json()).toEqual([]);
  });

  it('続けて 2 回読み込んでもバックアップのファイル名が重ならない', async () => {
    await seed();
    const { data } = await exportJson();
    const a = (await importJson(data)).json<ImportResult>().backupFile;
    const b = (await importJson(data)).json<ImportResult>().backupFile;
    expect(a).not.toBe(b);
  });
});
