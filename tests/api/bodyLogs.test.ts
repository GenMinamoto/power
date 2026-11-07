import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import type { BodyLogDetail, DailyStat, Dashboard } from '../../src/shared/types';

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

const put = (date: string, body: unknown) => app.inject({ method: 'PUT', url: `/api/body-logs/${date}`, payload: body as object });

describe('体組成 API', () => {
  it('新規登録と除脂肪体重の計算', async () => {
    const res = await put('2026-11-08', { weightKg: 74.84, bodyFatPct: 18.2, memo: ' 起床後 ' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      date: '2026-11-08',
      weightKg: 74.8,
      bodyFatPct: 18.2,
      memo: '起床後',
      leanBodyMassKg: 61.2,
      fatMassKg: 13.6,
    });
  });

  it('体重のみの登録（除脂肪体重は null）と上書き', async () => {
    await put('2026-11-08', { weightKg: 75, bodyFatPct: null, memo: null });
    const res = await put('2026-11-08', { weightKg: 74.5, bodyFatPct: null, memo: null });
    expect(res.json()).toMatchObject({ weightKg: 74.5, leanBodyMassKg: null, fatMassKg: null });
    const list = await app.inject('/api/body-logs');
    expect(list.json()).toHaveLength(1);
  });

  it('両方空・範囲外・不正な日付は 400', async () => {
    expect((await put('2026-11-08', { weightKg: null, bodyFatPct: null, memo: null })).statusCode).toBe(400);
    const res = await put('2026-11-08', { weightKg: 500, bodyFatPct: null, memo: null });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect((await put('2026-02-30', { weightKg: 70, bodyFatPct: null, memo: null })).statusCode).toBe(400);
  });

  it('詳細：前回の体重・体脂肪率', async () => {
    await put('2026-10-27', { weightKg: 76, bodyFatPct: 19, memo: null });
    await put('2026-11-07', { weightKg: 75, bodyFatPct: null, memo: null });
    const res = await app.inject('/api/body-logs/2026-11-08');
    const d = res.json() as BodyLogDetail;
    expect(d.log).toBeNull();
    expect(d.previousWeight).toEqual({ date: '2026-11-07', weightKg: 75 });
    expect(d.previousBodyFat).toMatchObject({ date: '2026-10-27', bodyFatPct: 19, leanBodyMassKg: 61.6 });
  });

  it('期間指定の一覧と削除', async () => {
    await put('2026-11-01', { weightKg: 76, bodyFatPct: null, memo: null });
    await put('2026-11-05', { weightKg: 75, bodyFatPct: null, memo: null });
    const list = await app.inject('/api/body-logs?from=2026-11-02&to=2026-11-30');
    expect(list.json().map((x: { date: string }) => x.date)).toEqual(['2026-11-05']);
    expect((await app.inject({ method: 'DELETE', url: '/api/body-logs/2026-11-05' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/api/body-logs/2026-11-05' })).statusCode).toBe(404);
  });
});

describe('集計 API', () => {
  it('日別：欠損日は null、期間の先頭でも7日平均が出る', async () => {
    for (const [d, w] of [
      ['2026-11-01', 76],
      ['2026-11-02', 75.8],
      ['2026-11-03', 75.6],
      ['2026-11-04', 75.4],
      ['2026-11-06', 75.0],
    ] as const) {
      await put(d, { weightKg: w, bodyFatPct: null, memo: null });
    }
    const res = await app.inject('/api/stats/daily?from=2026-11-05&to=2026-11-06');
    const days = res.json() as DailyStat[];
    expect(days.map((d) => d.date)).toEqual(['2026-11-05', '2026-11-06']);
    expect(days[0]).toMatchObject({ weightKg: null, weightMa7: 75.7, kcal: null, mealCount: 0 }); // 76〜75.4 の4日
    expect(days[1]).toMatchObject({ weightKg: 75, weightMa7: 75.6 }); // 5日の平均 75.56
  });

  it('期間省略時は最初の記録日から今日まで', async () => {
    await put('2026-01-01', { weightKg: 70, bodyFatPct: null, memo: null });
    const days = (await app.inject('/api/stats/daily')).json() as DailyStat[];
    expect(days[0]!.date).toBe('2026-01-01');
  });

  it('ダッシュボード：最新の体重・体脂肪率とお知らせ', async () => {
    await put('2026-10-25', { weightKg: 76, bodyFatPct: 19, memo: null });
    await put('2026-11-07', { weightKg: 75.2, bodyFatPct: null, memo: null });
    await put('2026-11-08', { weightKg: 75.0, bodyFatPct: null, memo: null });
    const d = (await app.inject('/api/dashboard?date=2026-11-08')).json() as Dashboard;
    expect(d.weight).toMatchObject({ latest: 75, latestDate: '2026-11-08', diffFromPrev: -0.2 });
    expect(d.bodyFat).toMatchObject({ latest: 19, latestDate: '2026-10-25', daysSince: 14, reminder: true });

    await put('2026-11-08', { weightKg: 75.0, bodyFatPct: 18.5, memo: null });
    const d2 = (await app.inject('/api/dashboard?date=2026-11-08')).json() as Dashboard;
    expect(d2.bodyFat).toMatchObject({ latest: 18.5, daysSince: 0, reminder: false });
  });

  it('記録がなければ体脂肪率のお知らせを出す', async () => {
    const d = (await app.inject('/api/dashboard?date=2026-11-08')).json() as Dashboard;
    expect(d.bodyFat.reminder).toBe(true);
    expect(d.weight.latest).toBeNull();
  });
});

describe('バックアップ API', () => {
  it('手動バックアップを作成し一覧に出る', async () => {
    await put('2026-11-08', { weightKg: 75, bodyFatPct: null, memo: null });
    const res = await app.inject({ method: 'POST', url: '/api/backups' });
    expect(res.statusCode).toBe(201);
    const res2 = await app.inject({ method: 'POST', url: '/api/backups' });
    expect(res2.json().file).toMatch(/^power-\d{8}-2\.db$/);
    expect(readdirSync(backupDir)).toHaveLength(2);
    expect((await app.inject('/api/backups')).json()).toHaveLength(2);
  });

  it('未知の API は 404', async () => {
    const res = await app.inject('/api/unknown');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
