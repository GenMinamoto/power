import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import { estimateWorkoutKcal, workoutBonus } from '../../src/shared/calc';
import type { DailyStat, Dashboard, DayWorkouts, Workout } from '../../src/shared/types';

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

const D = '2026-11-20';
const run = (over: Record<string, unknown> = {}) => ({
  date: D,
  kind: 'run',
  name: 'ランニング',
  durationMin: 30,
  distanceKm: 5,
  kcal: 350,
  memo: null,
  ...over,
});
const add = (over: Record<string, unknown> = {}) => app.inject({ method: 'POST', url: '/api/workouts', payload: run(over) });
const day = async (date = D) => (await app.inject(`/api/workouts?date=${date}`)).json<DayWorkouts>();
const setWeight = (date: string, weightKg: number) =>
  app.inject({ method: 'PUT', url: `/api/body-logs/${date}`, payload: { weightKg, bodyFatPct: null, memo: null } });
const health = (over: Record<string, unknown> = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/workouts/health',
    payload: { date: D, kind: 'run', name: 'ランニング（ヘルスケア）', durationMin: 31.6, distanceKm: 5.234, kcal: 352.4, ...over },
  });

describe('計算', () => {
  it('消費の目安：距離があれば 体重×距離×係数、なければ (MET−1)×体重×時間', () => {
    expect(estimateWorkoutKcal('run', 70, 30, 5)).toBe(350); // 70×5×1.0
    expect(estimateWorkoutKcal('run', 70, 60, null)).toBe(560); // (9−1)×70×1
    expect(estimateWorkoutKcal('walk', 70, null, 4)).toBe(140); // 70×4×0.5
    expect(estimateWorkoutKcal('strength', 70, 45, null)).toBe(210); // (5−1)×70×0.75
    expect(estimateWorkoutKcal('strength', 70, null, 3)).toBeNull(); // 筋トレは距離では出せない
    expect(estimateWorkoutKcal('other', 70, 60, null)).toBeNull();
    expect(estimateWorkoutKcal('run', null, 30, 5)).toBeNull();
  });

  it('上乗せ：運動の消費に減量ペースを当てはめ、残りを炭水化物で足す', () => {
    expect(workoutBonus(350, 20)).toEqual({ kcal: 280, carbsG: 70 });
    expect(workoutBonus(350, 0)).toEqual({ kcal: 350, carbsG: 88 });
    expect(workoutBonus(0, 20)).toEqual({ kcal: 0, carbsG: 0 });
  });
});

describe('運動の記録', () => {
  it('追加・一覧・合計・上乗せ（プロフィールの減量ペース 20% を使う）', async () => {
    expect((await add()).statusCode).toBe(201);
    await add({ kind: 'strength', name: '筋トレ', durationMin: 45, distanceKm: null, kcal: 150 });
    const d = await day();
    expect(d.entries.map((e) => [e.name, e.kcal, e.source])).toEqual([
      ['ランニング', 350, 'manual'],
      ['筋トレ', 150, 'manual'],
    ]);
    expect(d.bonus).toEqual({ workoutKcal: 500, bonusKcal: 400, bonusCarbsG: 100, deficitPct: 20 });
    expect((await day('2026-11-21')).bonus.workoutKcal).toBe(0);
  });

  it('kcal 空欄なら、その日以前の最新の体重から目安を計算する', async () => {
    await setWeight('2026-11-10', 72);
    await setWeight('2026-11-25', 80); // 後の日の体重は使わない
    const res = await add({ kcal: null });
    expect(res.statusCode).toBe(201);
    expect(res.json<Workout>().kcal).toBe(360); // 72×5×1.0
  });

  it('その日以前に体重がなければ、後の日で最も近い体重を使う', async () => {
    await setWeight('2026-11-25', 80);
    await setWeight('2026-11-30', 90);
    expect((await add({ kcal: null })).json<Workout>().kcal).toBe(400);
  });

  it('kcal 空欄で計算できないときは 400 と理由', async () => {
    const noWeight = await add({ kcal: null });
    expect(noWeight.statusCode).toBe(400);
    expect(noWeight.json().error.message).toContain('体重の記録がないため');
    await setWeight(D, 70);
    const noTime = await add({ kind: 'strength', durationMin: null, distanceKm: null, kcal: null });
    expect(noTime.json().error.message).toContain('時間か距離がないため');
  });

  it('入力チェック', async () => {
    const r = await add({ kind: 'swim', name: '', kcal: 9000, durationMin: 0 });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.details.map((d: { path: string }) => d.path).sort()).toEqual(['durationMin', 'kcal', 'kind', 'name']);
  });

  it('更新・削除（なければ 404）', async () => {
    const w = (await add()).json<Workout>();
    const u = await app.inject({ method: 'PUT', url: `/api/workouts/${w.id}`, payload: run({ kcal: 300, memo: '  坂道  ' }) });
    expect(u.json<Workout>()).toMatchObject({ kcal: 300, memo: '坂道' });
    expect((await app.inject({ method: 'PUT', url: '/api/workouts/999', payload: run() })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/api/workouts/${w.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: `/api/workouts/${w.id}` })).statusCode).toBe(404);
  });
});

describe('ヘルスケアからの取り込み', () => {
  it('丸めて保存し、同じ日・種目・名前なら上書きする（手入力の記録には触れない）', async () => {
    await add({ name: 'ランニング（ヘルスケア）', kcal: 100 }); // 同じ名前の手入力
    const first = await health();
    expect(first.json()).toMatchObject({
      replaced: false,
      entry: { kcal: 352, durationMin: 32, distanceKm: 5.23, source: 'health' },
    });
    const second = await health({ kcal: 420 });
    expect(second.json()).toMatchObject({ replaced: true, entry: { id: first.json().entry.id, kcal: 420 } });
    const d = await day();
    expect(d.entries.map((e) => [e.source, e.kcal])).toEqual([
      ['manual', 100],
      ['health', 420],
    ]);
  });

  it('別の日・別の種目は別の記録になる', async () => {
    await health();
    await health({ date: '2026-11-21' });
    await health({ kind: 'walk', name: 'ウォーキング（ヘルスケア）', kcal: 80 });
    expect((await day()).entries).toHaveLength(2);
    expect((await day('2026-11-21')).entries).toHaveLength(1);
  });

  it('kcal は必須', async () => {
    expect((await health({ kcal: null })).statusCode).toBe(400);
  });
});

describe('目標・グラフ・ホームへの反映', () => {
  const goal = { startDate: '2026-11-01', kcal: 2000, proteinG: 150, fatG: 50, carbsG: 230, targetWeightKg: null, targetBodyFatPct: null, targetDate: null };

  it('日別の統計：運動した日だけ目標カロリー・炭水化物に上乗せ', async () => {
    await app.inject({ method: 'POST', url: '/api/goals', payload: goal });
    await add();
    const days = (await app.inject(`/api/stats/daily?from=2026-11-19&to=${D}`)).json<DailyStat[]>();
    expect(days.map((d) => [d.date, d.workoutKcal, d.goalKcal, d.goalCarbsG])).toEqual([
      ['2026-11-19', null, 2000, 230],
      [D, 350, 2280, 300],
    ]);
  });

  it('ホーム：上乗せと、1 日の消費の目安（基礎代謝 × 活動レベル ＋ 運動）', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/profile',
      payload: { sex: 'male', birthDate: '1996-01-01', heightCm: 175, bmrKcal: null, activityLevel: 1.2, deficitPct: 20, proteinPerKg: 2, fatPct: 20 },
    });
    await setWeight(D, 75);
    await add();
    const dash = (await app.inject(`/api/dashboard?date=${D}`)).json<Dashboard>();
    expect(dash.bonus).toMatchObject({ workoutKcal: 350, bonusKcal: 280 });
    // 30 歳：10×75 ＋ 6.25×175 − 5×30 ＋ 5 = 1699、× 1.2 = 2039
    expect(dash.energy).toEqual({ bmr: 1699, activityLevel: 1.2, baseKcal: 2039, workoutKcal: 350, totalKcal: 2389 });
  });

  it('プロフィールが足りなければ消費の目安は null', async () => {
    expect((await app.inject(`/api/dashboard?date=${D}`)).json<Dashboard>().energy).toBeNull();
  });

  it('最初の記録日に運動も含める', async () => {
    await add({ date: '2026-10-01' });
    const days = (await app.inject(`/api/stats/daily?to=2026-10-02`)).json<DailyStat[]>();
    expect(days[0]!.date).toBe('2026-10-01');
  });
});

describe('エクスポート / インポート', () => {
  it('運動も書き出し・読み込みできる。運動のない古いファイルも読み込める', async () => {
    await add();
    await health();
    const exported = (await app.inject('/api/export')).json();
    expect(exported.workouts).toHaveLength(2);

    await app.inject({ method: 'DELETE', url: `/api/workouts/${exported.workouts[0].id}` });
    const r = await app.inject({ method: 'POST', url: '/api/import', payload: exported });
    expect(r.json().imported.workouts).toBe(2);
    expect((await app.inject('/api/export')).json().workouts).toEqual(exported.workouts);

    const { workouts: _, ...old } = exported;
    const r2 = await app.inject({ method: 'POST', url: '/api/import', payload: old });
    expect(r2.statusCode).toBe(200);
    expect((await day()).entries).toEqual([]);
  });
});
