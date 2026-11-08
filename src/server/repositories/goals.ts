import { round } from '../../shared/calc.js';
import type { GoalInput } from '../../shared/schemas.js';
import type { Goal } from '../../shared/types.js';
import { nowIso, type Db } from '../db.js';

type Row = {
  id: number;
  start_date: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  target_weight_kg: number | null;
  target_body_fat_pct: number | null;
  target_date: string | null;
};

export function toGoal(r: Row): Goal {
  return {
    id: r.id,
    startDate: r.start_date,
    kcal: r.kcal,
    proteinG: r.protein_g,
    fatG: r.fat_g,
    carbsG: r.carbs_g,
    targetWeightKg: r.target_weight_kg,
    targetBodyFatPct: r.target_body_fat_pct,
    targetDate: r.target_date,
  };
}

const opt1 = (v: number | null) => (v == null ? null : round(v, 1));

export class GoalRepository {
  constructor(private db: Db) {}

  /** その日に適用される目標（開始日がその日以前で最も新しいもの） */
  effective(date: string): Goal | null {
    const r = this.db.prepare('SELECT * FROM goals WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1').get(date) as
      | Row
      | undefined;
    return r ? toGoal(r) : null;
  }

  /** 開始日の昇順で全件 */
  all(): Goal[] {
    return (this.db.prepare('SELECT * FROM goals ORDER BY start_date').all() as Row[]).map(toGoal);
  }

  /** 同じ開始日の目標があれば上書きする */
  upsert(input: GoalInput): Goal {
    this.db
      .prepare(
        `INSERT INTO goals (start_date, kcal, protein_g, fat_g, carbs_g, target_weight_kg, target_body_fat_pct, target_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(start_date) DO UPDATE SET
           kcal = excluded.kcal, protein_g = excluded.protein_g, fat_g = excluded.fat_g, carbs_g = excluded.carbs_g,
           target_weight_kg = excluded.target_weight_kg, target_body_fat_pct = excluded.target_body_fat_pct,
           target_date = excluded.target_date`,
      )
      .run(
        input.startDate,
        Math.round(input.kcal),
        round(input.proteinG, 1),
        round(input.fatG, 1),
        round(input.carbsG, 1),
        opt1(input.targetWeightKg),
        opt1(input.targetBodyFatPct),
        input.targetDate,
        nowIso(),
      );
    return toGoal(this.db.prepare('SELECT * FROM goals WHERE start_date = ?').get(input.startDate) as Row);
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM goals WHERE id = ?').run(id).changes > 0;
  }
}
