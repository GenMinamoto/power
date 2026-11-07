import { fatMass, leanBodyMass, round } from '../../shared/calc.js';
import type { BodyLogInput } from '../../shared/schemas.js';
import type { BodyFatPoint, BodyLog, BodyLogDetail } from '../../shared/types.js';
import { nowIso, type Db } from '../db.js';

type Row = { date: string; weight_kg: number | null; body_fat_pct: number | null; memo: string | null };

export function toBodyLog(r: Row): BodyLog {
  const both = r.weight_kg != null && r.body_fat_pct != null;
  return {
    date: r.date,
    weightKg: r.weight_kg,
    bodyFatPct: r.body_fat_pct,
    memo: r.memo,
    leanBodyMassKg: both ? leanBodyMass(r.weight_kg!, r.body_fat_pct!) : null,
    fatMassKg: both ? fatMass(r.weight_kg!, r.body_fat_pct!) : null,
  };
}

function toBodyFatPoint(r: Row): BodyFatPoint {
  const b = toBodyLog(r);
  return { date: b.date, weightKg: b.weightKg, bodyFatPct: b.bodyFatPct!, leanBodyMassKg: b.leanBodyMassKg, fatMassKg: b.fatMassKg };
}

const COLS = 'date, weight_kg, body_fat_pct, memo';

export class BodyLogRepository {
  constructor(private db: Db) {}

  list(from?: string, to?: string): BodyLog[] {
    const rows = this.db
      .prepare(`SELECT ${COLS} FROM body_logs WHERE date >= ? AND date <= ? ORDER BY date`)
      .all(from ?? '0000-00-00', to ?? '9999-99-99') as Row[];
    return rows.map(toBodyLog);
  }

  get(date: string): BodyLog | null {
    const r = this.db.prepare(`SELECT ${COLS} FROM body_logs WHERE date = ?`).get(date) as Row | undefined;
    return r ? toBodyLog(r) : null;
  }

  detail(date: string): BodyLogDetail {
    const prevFat = this.db
      .prepare(`SELECT ${COLS} FROM body_logs WHERE date < ? AND body_fat_pct IS NOT NULL ORDER BY date DESC LIMIT 1`)
      .get(date) as Row | undefined;
    const prevWeight = this.db
      .prepare(`SELECT date, weight_kg FROM body_logs WHERE date < ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 1`)
      .get(date) as { date: string; weight_kg: number } | undefined;
    return {
      log: this.get(date),
      previousBodyFat: prevFat ? toBodyFatPoint(prevFat) : null,
      previousWeight: prevWeight ? { date: prevWeight.date, weightKg: prevWeight.weight_kg } : null,
    };
  }

  /** date 以前で最新の体脂肪率測定 */
  latestBodyFat(onOrBefore: string): BodyFatPoint | null {
    const r = this.db
      .prepare(`SELECT ${COLS} FROM body_logs WHERE date <= ? AND body_fat_pct IS NOT NULL ORDER BY date DESC LIMIT 1`)
      .get(onOrBefore) as Row | undefined;
    return r ? toBodyFatPoint(r) : null;
  }

  /** date 以前で最新の体重 2 件（最新と、その前） */
  latestWeights(onOrBefore: string): { date: string; weightKg: number }[] {
    const rows = this.db
      .prepare(`SELECT date, weight_kg FROM body_logs WHERE date <= ? AND weight_kg IS NOT NULL ORDER BY date DESC LIMIT 2`)
      .all(onOrBefore) as { date: string; weight_kg: number }[];
    return rows.map((r) => ({ date: r.date, weightKg: r.weight_kg }));
  }

  firstDate(): string | null {
    const r = this.db.prepare('SELECT MIN(date) AS d FROM body_logs').get() as { d: string | null };
    return r.d;
  }

  upsert(date: string, input: BodyLogInput): BodyLog {
    const now = nowIso();
    const weight = input.weightKg == null ? null : round(input.weightKg, 1);
    const fat = input.bodyFatPct == null ? null : round(input.bodyFatPct, 1);
    const memo = input.memo?.trim() ? input.memo.trim() : null;
    this.db
      .prepare(
        `INSERT INTO body_logs (date, weight_kg, body_fat_pct, memo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct,
           memo = excluded.memo, updated_at = excluded.updated_at`,
      )
      .run(date, weight, fat, memo, now, now);
    return this.get(date)!;
  }

  delete(date: string): boolean {
    return this.db.prepare('DELETE FROM body_logs WHERE date = ?').run(date).changes > 0;
  }
}
