import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import type { ApiErrorBody, DailyStat, Dashboard, DayMeals, Goal, Profile } from '../../src/shared/types';

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

const profile = {
  sex: 'male',
  birthDate: '1996-04-01',
  heightCm: 175,
  bmrKcal: null,
  activityLevel: 1.55,
  deficitPct: 20,
  proteinPerKg: 2.0,
  fatPct: 20,
};

const goal = (over: Record<string, unknown> = {}) => ({
  startDate: '2026-11-01',
  kcal: 2106,
  proteinG: 150,
  fatG: 47,
  carbsG: 271,
  targetWeightKg: 70,
  targetBodyFatPct: 12,
  targetDate: '2027-03-31',
  ...over,
});

const post = (body: unknown) => app.inject({ method: 'POST', url: '/api/goals', payload: body as object });

describe('プロフィール', () => {
  it('初期値を返し、保存すると上書きされる', async () => {
    const init = (await app.inject('/api/profile')).json<Profile>();
    expect(init).toEqual({
      sex: null,
      birthDate: null,
      heightCm: null,
      bmrKcal: null,
      activityLevel: 1.55,
      deficitPct: 20,
      proteinPerKg: 2.0,
      fatPct: 20,
    });

    const res = await app.inject({ method: 'PUT', url: '/api/profile', payload: { ...profile, bmrKcal: 1799.6 } });
    expect(res.statusCode).toBe(200);
    expect(res.json<Profile>()).toEqual({ ...profile, bmrKcal: 1800 });
    expect((await app.inject('/api/profile')).json<Profile>().sex).toBe('male');
  });

  it('範囲外・未定義の活動係数・未来の生年月日は 400', async () => {
    for (const bad of [
      { heightCm: 99 },
      { bmrKcal: 400 },
      { activityLevel: 1.3 },
      { deficitPct: 35 },
      { proteinPerKg: 3.5 },
      { fatPct: 10 },
      { birthDate: '2999-01-01' },
      { sex: 'other' },
    ]) {
      const res = await app.inject({ method: 'PUT', url: '/api/profile', payload: { ...profile, ...bad } });
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe('目標', () => {
  it('追加・一覧（新しい順）・同じ開始日は上書き', async () => {
    expect((await post(goal())).statusCode).toBe(201);
    expect((await post(goal({ startDate: '2026-12-01', kcal: 2000 }))).statusCode).toBe(201);
    const again = await post(goal({ kcal: 2200.4, proteinG: 155.55 }));
    expect(again.statusCode).toBe(201);
    expect(again.json<Goal>()).toMatchObject({ startDate: '2026-11-01', kcal: 2200, proteinG: 155.6 });

    const list = (await app.inject('/api/goals')).json<Goal[]>();
    expect(list.map((g) => [g.startDate, g.kcal])).toEqual([
      ['2026-12-01', 2000],
      ['2026-11-01', 2200],
    ]);
  });

  it('effective：開始日より前は null、境界日から適用、次の目標に切り替わる', async () => {
    await post(goal());
    await post(goal({ startDate: '2026-12-01', kcal: 2000 }));
    const eff = async (date: string) => {
      const res = await app.inject(`/api/goals/effective?date=${date}`);
      expect(res.statusCode).toBe(200);
      return res.json<Goal | null>();
    };
    expect(await eff('2026-10-31')).toBeNull();
    expect((await eff('2026-11-01'))?.kcal).toBe(2106);
    expect((await eff('2026-11-30'))?.kcal).toBe(2106);
    expect((await eff('2026-12-01'))?.kcal).toBe(2000);
  });

  it('入力チェック', async () => {
    for (const bad of [
      { kcal: 500 },
      { kcal: null },
      { proteinG: -1 },
      { carbsG: 1001 },
      { targetWeightKg: 10 },
      { startDate: '2026-13-01' },
      { targetDate: '2026-10-01' },
    ]) {
      const res = await post(goal(bad));
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    const res = await post(goal({ targetDate: '2026-11-01' }));
    expect(res.json<ApiErrorBody>().error.details?.[0]).toEqual({
      path: 'targetDate',
      message: '目標期日は適用開始日より後の日にしてください',
    });
    // 目標体重などは省略できる
    expect((await post(goal({ targetWeightKg: null, targetBodyFatPct: null, targetDate: null }))).statusCode).toBe(201);
  });

  it('削除', async () => {
    const g = (await post(goal())).json<Goal>();
    expect((await app.inject({ method: 'DELETE', url: `/api/goals/${g.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/goals/${g.id}` })).statusCode).toBe(404);
    expect((await app.inject('/api/goals')).json()).toEqual([]);
  });

  it('食事・ホーム・グラフ用の集計に、その日の目標が付く', async () => {
    await post(goal());
    await post(goal({ startDate: '2026-11-05', kcal: 2000, targetWeightKg: 69 }));

    const meals = (await app.inject('/api/meals?date=2026-11-04')).json<DayMeals>();
    expect(meals.goal?.kcal).toBe(2106);
    const dash = (await app.inject('/api/dashboard?date=2026-11-05')).json<Dashboard>();
    expect(dash.goal?.kcal).toBe(2000);

    const days = (await app.inject('/api/stats/daily?from=2026-10-31&to=2026-11-06')).json<DailyStat[]>();
    expect(days.map((d) => d.goalKcal)).toEqual([null, 2106, 2106, 2106, 2106, 2000, 2000]);
    expect(days.at(-1)?.goalWeightKg).toBe(69);
  });
});
