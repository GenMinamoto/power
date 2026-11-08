import { kcalFromPfc, round } from '../../shared/calc.js';
import type { FoodInput } from '../../shared/schemas.js';
import type { Food } from '../../shared/types.js';
import { nowIso, type Db } from '../db.js';
import { notFound } from '../errors.js';

type Row = {
  id: number;
  name: string;
  serving_note: string | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  use_count: number;
};

const toFood = (r: Row): Food => ({
  id: r.id,
  name: r.name,
  servingNote: r.serving_note,
  kcal: r.kcal,
  proteinG: r.protein_g,
  fatG: r.fat_g,
  carbsG: r.carbs_g,
  useCount: r.use_count,
});

function normalize(input: FoodInput) {
  const p = round(input.proteinG, 1);
  const f = round(input.fatG, 1);
  const c = round(input.carbsG, 1);
  return {
    name: input.name.trim(),
    servingNote: input.servingNote?.trim() || null,
    kcal: input.kcal == null ? kcalFromPfc(p, f, c) : Math.round(input.kcal),
    proteinG: p,
    fatG: f,
    carbsG: c,
  };
}

/** LIKE の特殊文字（% _ \）をエスケープ */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export const FOOD_SEARCH_LIMIT = 20;

export class FoodRepository {
  constructor(private db: Db) {}

  get(id: number): Food | null {
    const r = this.db.prepare('SELECT * FROM foods WHERE id = ?').get(id) as Row | undefined;
    return r ? toFood(r) : null;
  }

  /** q なしは全件、あれば部分一致で最大 20 件。よく使う順 → 名前順 */
  list(q?: string): Food[] {
    if (!q) {
      return (this.db.prepare('SELECT * FROM foods ORDER BY use_count DESC, name, id').all() as Row[]).map(toFood);
    }
    const rows = this.db
      .prepare(
        `SELECT * FROM foods WHERE name LIKE ? ESCAPE '\\' OR serving_note LIKE ? ESCAPE '\\'
         ORDER BY (name LIKE ? ESCAPE '\\') DESC, use_count DESC, name, id LIMIT ?`,
      )
      .all(`%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `${escapeLike(q)}%`, FOOD_SEARCH_LIMIT) as Row[];
    return rows.map(toFood);
  }

  create(input: FoodInput): Food {
    const v = normalize(input);
    const now = nowIso();
    const res = this.db
      .prepare(
        `INSERT INTO foods (name, serving_note, kcal, protein_g, fat_g, carbs_g, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(v.name, v.servingNote, v.kcal, v.proteinG, v.fatG, v.carbsG, now, now);
    return this.get(Number(res.lastInsertRowid))!;
  }

  /** 過去の食事記録は記録時点の値を持つので変わらない */
  update(id: number, input: FoodInput): Food {
    const v = normalize(input);
    const res = this.db
      .prepare(
        `UPDATE foods SET name = ?, serving_note = ?, kcal = ?, protein_g = ?, fat_g = ?, carbs_g = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(v.name, v.servingNote, v.kcal, v.proteinG, v.fatG, v.carbsG, nowIso(), id);
    if (res.changes === 0) throw notFound('この食品は見つかりません');
    return this.get(id)!;
  }

  /** 食事記録の food_id は NULL になる（記録自体は残る） */
  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM foods WHERE id = ?').run(id).changes > 0;
  }
}
