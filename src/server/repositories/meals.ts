import { kcalFromPfc, round, sumNutrients, type Nutrients } from '../../shared/calc.js';
import { MEAL_TYPES, type MealType } from '../../shared/constants.js';
import type { CopyMealsInput, MealEntryInput } from '../../shared/schemas.js';
import type { DayMeals, MealEntry } from '../../shared/types.js';
import { nowIso, transaction, type Db } from '../db.js';
import { HttpError, notFound } from '../errors.js';
import { GoalRepository } from './goals.js';

type Row = {
  id: number;
  date: string;
  meal_type: MealType;
  sort_order: number;
  food_name: string;
  amount_note: string | null;
  food_id: number | null;
  multiplier: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  memo: string | null;
};

function toEntry(r: Row): MealEntry {
  return {
    id: r.id,
    date: r.date,
    mealType: r.meal_type,
    sortOrder: r.sort_order,
    foodName: r.food_name,
    amountNote: r.amount_note,
    foodId: r.food_id,
    multiplier: r.multiplier,
    kcal: r.kcal,
    proteinG: r.protein_g,
    fatG: r.fat_g,
    carbsG: r.carbs_g,
    memo: r.memo,
  };
}

/** 保存前の整形：丸め、kcal の補完、空文字を null に */
function normalize(input: MealEntryInput) {
  const p = round(input.proteinG, 1);
  const f = round(input.fatG, 1);
  const c = round(input.carbsG, 1);
  return {
    date: input.date,
    mealType: input.mealType,
    foodName: input.foodName.trim(),
    amountNote: input.amountNote?.trim() || null,
    foodId: input.foodId,
    multiplier: input.multiplier == null ? null : round(input.multiplier, 2),
    kcal: input.kcal == null ? kcalFromPfc(p, f, c) : Math.round(input.kcal),
    proteinG: p,
    fatG: f,
    carbsG: c,
    memo: input.memo?.trim() || null,
  };
}

const ORDER = `CASE meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END, sort_order, id`;

export class MealRepository {
  private goals: GoalRepository;

  constructor(private db: Db) {
    this.goals = new GoalRepository(db);
  }

  get(id: number): MealEntry | null {
    const r = this.db.prepare('SELECT * FROM meal_entries WHERE id = ?').get(id) as Row | undefined;
    return r ? toEntry(r) : null;
  }

  listByDate(date: string): MealEntry[] {
    return (this.db.prepare(`SELECT * FROM meal_entries WHERE date = ? ORDER BY ${ORDER}`).all(date) as Row[]).map(toEntry);
  }

  day(date: string): DayMeals {
    const entries = this.listByDate(date);
    const subtotals = Object.fromEntries(
      MEAL_TYPES.map((t) => [t, sumNutrients(entries.filter((e) => e.mealType === t))]),
    ) as Record<MealType, Nutrients>;
    return { date, entries, subtotals, total: sumNutrients(entries), goal: this.goals.effective(date) };
  }

  /** その日の摂取合計 */
  total(date: string): Nutrients & { count: number } {
    const entries = this.listByDate(date);
    return { ...sumNutrients(entries), count: entries.length };
  }

  private nextSortOrder(date: string, mealType: MealType): number {
    const r = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM meal_entries WHERE date = ? AND meal_type = ?')
      .get(date, mealType) as { n: number };
    return r.n;
  }

  private assertFoodExists(foodId: number | null): void {
    if (foodId == null) return;
    const r = this.db.prepare('SELECT 1 FROM foods WHERE id = ?').get(foodId);
    if (!r) throw new HttpError(400, 'VALIDATION_ERROR', '指定された食品が見つかりません');
  }

  create(input: MealEntryInput): MealEntry {
    const v = normalize(input);
    return transaction(this.db, () => {
      this.assertFoodExists(v.foodId);
      const now = nowIso();
      const res = this.db
        .prepare(
          `INSERT INTO meal_entries
             (date, meal_type, sort_order, food_name, amount_note, food_id, multiplier,
              kcal, protein_g, fat_g, carbs_g, memo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          v.date,
          v.mealType,
          this.nextSortOrder(v.date, v.mealType),
          v.foodName,
          v.amountNote,
          v.foodId,
          v.multiplier,
          v.kcal,
          v.proteinG,
          v.fatG,
          v.carbsG,
          v.memo,
          now,
          now,
        );
      if (v.foodId != null) {
        this.db.prepare('UPDATE foods SET use_count = use_count + 1 WHERE id = ?').run(v.foodId);
      }
      return this.get(Number(res.lastInsertRowid))!;
    });
  }

  update(id: number, input: MealEntryInput): MealEntry {
    const v = normalize(input);
    return transaction(this.db, () => {
      const cur = this.get(id);
      if (!cur) throw notFound('この食事の記録は見つかりません');
      this.assertFoodExists(v.foodId);
      // 日付や区分を変えた場合は、移動先の末尾に並べる
      const moved = cur.date !== v.date || cur.mealType !== v.mealType;
      const sortOrder = moved ? this.nextSortOrder(v.date, v.mealType) : cur.sortOrder;
      this.db
        .prepare(
          `UPDATE meal_entries SET
             date = ?, meal_type = ?, sort_order = ?, food_name = ?, amount_note = ?, food_id = ?, multiplier = ?,
             kcal = ?, protein_g = ?, fat_g = ?, carbs_g = ?, memo = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          v.date,
          v.mealType,
          sortOrder,
          v.foodName,
          v.amountNote,
          v.foodId,
          v.multiplier,
          v.kcal,
          v.proteinG,
          v.fatG,
          v.carbsG,
          v.memo,
          nowIso(),
          id,
        );
      return this.get(id)!;
    });
  }

  /**
   * fromDate の食事を toDate にコピーする（コピー先の既存の行は残し、各区分の末尾に追加）。
   * 記録時点の値をそのままコピーする。コピーした件数を返す。
   */
  copy(input: CopyMealsInput): number {
    const src = this.listByDate(input.fromDate).filter((e) => input.mealType == null || e.mealType === input.mealType);
    if (src.length === 0) throw notFound('コピー元の日に食事の記録がありません');
    return transaction(this.db, () => {
      const now = nowIso();
      const insert = this.db.prepare(
        `INSERT INTO meal_entries
           (date, meal_type, sort_order, food_name, amount_note, food_id, multiplier,
            kcal, protein_g, fat_g, carbs_g, memo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const next: Partial<Record<MealType, number>> = {};
      for (const e of src) {
        const order = next[e.mealType] ?? this.nextSortOrder(input.toDate, e.mealType);
        next[e.mealType] = order + 1;
        insert.run(
          input.toDate,
          e.mealType,
          order,
          e.foodName,
          e.amountNote,
          e.foodId,
          e.multiplier,
          e.kcal,
          e.proteinG,
          e.fatG,
          e.carbsG,
          e.memo,
          now,
          now,
        );
      }
      return src.length;
    });
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM meal_entries WHERE id = ?').run(id).changes > 0;
  }
}
