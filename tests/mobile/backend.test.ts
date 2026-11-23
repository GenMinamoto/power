import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MobileBackend } from '../../src/mobile/backend';
import { MemoryStorage } from '../../src/mobile/storage';
import { buildApp } from '../../src/server/app';
import { openDb, type Db } from '../../src/server/db';
import type { BackupInfo, Food, MealEntry } from '../../src/shared/types';

let SQL: SqlJsStatic;
let storage: MemoryStorage;
let be: MobileBackend;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(async () => {
  storage = new MemoryStorage();
  be = await MobileBackend.create(SQL, storage);
});

const meal = (date: string, kcal: number, over: Record<string, unknown> = {}) => ({
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
});

const food = { name: 'オートミール', servingNote: '40g', kcal: 150, proteinG: 5.4, fatG: 2.3, carbsG: 27.6 };

describe('スマホ版バックエンド：基本の読み書き', () => {
  it('体組成を保存して読み出せる', async () => {
    const put = await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75.4, bodyFatPct: 18.2, memo: null });
    expect(put.status).toBe(200);
    const got = await be.request('GET', '/api/body-logs/2026-11-20');
    expect(got.body).toMatchObject({ log: { date: '2026-11-20', weightKg: 75.4, bodyFatPct: 18.2 } });
  });

  it('入力チェックの誤りは 400 と項目ごとのメッセージになる', async () => {
    const r = await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 500, bodyFatPct: null, memo: null });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: { code: 'VALIDATION_ERROR', details: [{ path: 'weightKg' }] } });
  });

  it('存在しないものの削除は 404、知らない API も 404', async () => {
    expect((await be.request('DELETE', '/api/foods/999')).status).toBe(404);
    expect((await be.request('GET', '/api/unknown')).status).toBe(404);
  });

  it('固定のパス（/api/meals/copy）は変数入りのパスより優先される', async () => {
    await be.request('POST', '/api/meals', meal('2026-11-19', 300));
    const r = await be.request('POST', '/api/meals/copy', { fromDate: '2026-11-19', toDate: '2026-11-20', mealType: null });
    expect(r).toEqual({ status: 200, body: { copied: 1 } });
  });

  it('作成は 201、削除は 204（本文なし）', async () => {
    const c = await be.request('POST', '/api/foods', food);
    expect(c.status).toBe(201);
    const d = await be.request('DELETE', `/api/foods/${(c.body as Food).id}`);
    expect(d).toEqual({ status: 204, body: undefined });
  });

  it('外部キーが有効：食品を消すと食事の参照は外れる（保存の後も有効なまま）', async () => {
    const f = (await be.request('POST', '/api/foods', food)).body as Food;
    const m = (await be.request('POST', '/api/meals', meal('2026-11-20', 150, { foodId: f.id, multiplier: 1 }))).body as MealEntry;
    expect(m.foodId).toBe(f.id);
    await be.request('DELETE', `/api/foods/${f.id}`);
    const day = (await be.request('GET', '/api/meals?date=2026-11-20')).body as { entries: MealEntry[] };
    expect(day.entries[0]!.foodId).toBeNull();
  });
});

describe('スマホ版バックエンド：端末への保存', () => {
  it('変更は返事の前に保存され、作り直しても残っている', async () => {
    await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75.4, bodyFatPct: null, memo: null });
    expect(storage.db).not.toBeNull();
    const again = await MobileBackend.create(SQL, storage);
    const r = await again.request('GET', '/api/body-logs?from=2026-11-01&to=2026-11-30');
    expect(r.body).toMatchObject([{ date: '2026-11-20', weightKg: 75.4 }]);
  });

  it('読み出しだけでは保存しない', async () => {
    const before = storage.db;
    await be.request('GET', '/api/dashboard?date=2026-11-20');
    expect(storage.db).toBe(before);
  });

  it('保存に失敗したら 500 を返し、変更は取り消される', async () => {
    await be.request('PUT', '/api/body-logs/2026-11-19', { weightKg: 75, bodyFatPct: null, memo: null });
    storage.saveDb = async () => {
      throw new Error('QuotaExceededError');
    };
    const r = await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 74, bodyFatPct: null, memo: null });
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ error: { code: 'SAVE_FAILED' } });
    const list = (await be.request('GET', '/api/body-logs')).body as { date: string }[];
    expect(list.map((b) => b.date)).toEqual(['2026-11-19']);
  });

  it('同時に呼ばれても 1 件ずつ順番に処理する', async () => {
    const rs = await Promise.all(
      Array.from({ length: 10 }, (_, i) => be.request('POST', '/api/meals', meal('2026-11-20', 100 + i))),
    );
    expect(rs.every((r) => r.status === 201)).toBe(true);
    const day = (await be.request('GET', '/api/meals?date=2026-11-20')).body as { entries: MealEntry[] };
    expect(day.entries.map((e) => e.sortOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('スマホ版バックエンド：バックアップ・エクスポート・インポート', () => {
  it('2 回目以降の起動で 1 日 1 回バックアップする（初回の空の状態では作らない）', async () => {
    expect((await be.request('GET', '/api/backups')).body).toEqual([]);
    await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75, bodyFatPct: null, memo: null });
    const now = new Date(2026, 10, 23, 8, 0, 0);
    const b2 = await MobileBackend.create(SQL, storage, now);
    await MobileBackend.create(SQL, storage, now); // 同じ日にもう一度起動しても増えない
    const list = (await b2.request('GET', '/api/backups')).body as BackupInfo[];
    expect(list.map((b) => b.file)).toEqual(['power-20261123.db']);
    expect(storage.backups.has('power-20261123.db')).toBe(true);
  });

  it('バックアップから復元でき、復元前の状態もバックアップされる', async () => {
    await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75, bodyFatPct: null, memo: null });
    const { file } = (await be.request('POST', '/api/backups')).body as { file: string };
    await be.request('PUT', '/api/body-logs/2026-11-21', { weightKg: 74, bodyFatPct: null, memo: null });

    const r = await be.request('POST', '/api/backups/restore', { file });
    expect(r.status).toBe(200);
    expect((r.body as { backupFile: string }).backupFile).toMatch(/-pre-import\.db$/);
    const list = (await be.request('GET', '/api/body-logs')).body as { date: string }[];
    expect(list.map((b) => b.date)).toEqual(['2026-11-20']);

    // 再起動しても復元後の状態
    const again = await MobileBackend.create(SQL, storage);
    expect(((await again.request('GET', '/api/body-logs')).body as unknown[]).length).toBe(1);
  });

  it('存在しないバックアップの復元は 404', async () => {
    expect((await be.request('POST', '/api/backups/restore', { file: 'power-20000101.db' })).status).toBe(404);
  });

  it('エクスポートした内容をインポートすると元に戻る', async () => {
    const f = (await be.request('POST', '/api/foods', food)).body as Food;
    await be.request('POST', '/api/meals', meal('2026-11-20', 150, { foodId: f.id, multiplier: 1 }));
    await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75, bodyFatPct: 18, memo: 'メモ' });
    const exported = (await be.request('GET', '/api/export')).body as Record<string, unknown>;

    const fresh = await MobileBackend.create(SQL, new MemoryStorage());
    const r = await fresh.request('POST', '/api/import', exported);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ imported: { bodyLogs: 1, foods: 1, mealEntries: 1, goals: 0 } });
    const again = (await fresh.request('GET', '/api/export')).body as Record<string, unknown>;
    expect({ ...again, exportedAt: null }).toEqual({ ...exported, exportedAt: null });
  });

  it('不正なファイルは 400 で、何も変更しない', async () => {
    await be.request('PUT', '/api/body-logs/2026-11-20', { weightKg: 75, bodyFatPct: null, memo: null });
    const r = await be.request('POST', '/api/import', { app: 'power', version: 1 });
    expect(r.status).toBe(400);
    expect(((await be.request('GET', '/api/body-logs')).body as unknown[]).length).toBe(1);
  });
});

describe('PC 版と同じ結果になる', () => {
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

  /** 作成日時など、実行のたびに変わる値を除く */
  const stable = (v: unknown): unknown =>
    JSON.parse(JSON.stringify(v ?? null), (k, x) => (['createdAt', 'updatedAt', 'exportedAt'].includes(k) ? '*' : x));

  it('一連の操作で、すべての応答（ステータスと本文）が一致する', async () => {
    const steps: [string, string, unknown?][] = [
      ['PUT', '/api/profile', { sex: 'male', birthDate: '1995-04-01', heightCm: 175, bmrKcal: null, activityLevel: 1.55, deficitPct: 20, proteinPerKg: 2, fatPct: 20 }],
      ['GET', '/api/profile'],
      ['PUT', '/api/body-logs/2026-11-01', { weightKg: 76, bodyFatPct: 19, memo: null }],
      ['PUT', '/api/body-logs/2026-11-08', { weightKg: 75.2, bodyFatPct: null, memo: '朝' }],
      ['PUT', '/api/body-logs/2026-11-09', { weightKg: 500, bodyFatPct: null, memo: null }],
      ['GET', '/api/body-logs/2026-11-08'],
      ['POST', '/api/foods', food],
      ['POST', '/api/foods', { ...food, name: '' }],
      ['GET', '/api/foods?q=オート'],
      ['POST', '/api/meals', meal('2026-11-08', 150, { foodId: 1, multiplier: 1.5 })],
      ['POST', '/api/meals', meal('2026-11-08', 600, { mealType: 'lunch' })],
      ['POST', '/api/meals/copy', { fromDate: '2026-11-08', toDate: '2026-11-09', mealType: null }],
      ['PUT', '/api/meals/2', meal('2026-11-08', 650, { mealType: 'lunch' })],
      ['DELETE', '/api/meals/99'],
      ['GET', '/api/meals?date=2026-11-09'],
      ['POST', '/api/goals', { startDate: '2026-11-01', kcal: 2000, proteinG: 150, fatG: 50, carbsG: 230, targetWeightKg: 70, targetBodyFatPct: 15, targetDate: '2027-03-31' }],
      ['GET', '/api/goals'],
      ['GET', '/api/goals/effective?date=2026-11-08'],
      ['GET', '/api/dashboard?date=2026-11-08'],
      ['GET', '/api/stats/daily?from=2026-11-01&to=2026-11-10'],
      ['GET', '/api/stats/weekly?from=2026-11-01&to=2026-11-10'],
      ['GET', '/api/stats/daily?from=2026-13-01'],
      ['DELETE', '/api/foods/1'],
      ['GET', '/api/meals?date=2026-11-08'],
      ['DELETE', '/api/body-logs/2026-11-01'],
      ['GET', '/api/export'],
    ];
    for (const [method, url, payload] of steps) {
      const pc = await app.inject({ method: method as 'GET', url, payload: payload as object });
      const mobile = await be.request(method, url, payload);
      const pcBody = pc.body === '' ? null : pc.json();
      expect({ step: `${method} ${url}`, status: mobile.status, body: stable(mobile.body) }).toEqual({
        step: `${method} ${url}`,
        status: pc.statusCode,
        body: stable(pcBody),
      });
    }
  });
});
