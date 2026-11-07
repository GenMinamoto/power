import type { Goal } from '../../shared/types.js';
import type { Db } from '../db.js';

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
}
