import { z } from 'zod';
import { ACTIVITY_LEVELS, LIMITS, MEAL_TYPES } from '../shared/constants.js';
import { isValidDate } from '../shared/date.js';
import type { BackupService } from './backup.js';
import { nowIso, transaction, type Db } from './db.js';
import { HttpError } from './errors.js';

// エクスポート / インポート（全データの JSON）。
// id・作成日時も含めて書き出し、そのまま復元できる形にする。

export const EXPORT_APP = 'power';
export const EXPORT_VERSION = 1;

const date = z.string().refine(isValidDate, { message: '日付が正しくありません' });
const ts = z.string().min(1).max(40);
const num = (min: number, max: number) => z.number().min(min).max(max);
const text = (max: number) => z.string().max(max);

const profileSchema = z.object({
  sex: z.enum(['male', 'female']).nullable(),
  birthDate: date.nullable(),
  heightCm: num(LIMITS.heightCm.min, LIMITS.heightCm.max).nullable(),
  bmrKcal: z.number().int().min(LIMITS.bmrKcal.min).max(LIMITS.bmrKcal.max).nullable(),
  activityLevel: z.number().refine((v) => ACTIVITY_LEVELS.some((a) => a.value === v)),
  deficitPct: num(LIMITS.deficitPct.min, LIMITS.deficitPct.max),
  proteinPerKg: num(LIMITS.proteinPerKg.min, LIMITS.proteinPerKg.max),
  fatPct: num(LIMITS.fatPct.min, LIMITS.fatPct.max),
  updatedAt: ts,
});

const bodyLogSchema = z
  .object({
    date,
    weightKg: num(LIMITS.weightKg.min, LIMITS.weightKg.max).nullable(),
    bodyFatPct: num(LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max).nullable(),
    memo: text(LIMITS.memoLength).nullable(),
    createdAt: ts,
    updatedAt: ts,
  })
  .refine((v) => v.weightKg != null || v.bodyFatPct != null, { message: '体重か体脂肪率が必要です' });

const id = z.number().int().positive();

const foodSchema = z.object({
  id,
  name: z.string().min(1).max(LIMITS.foodNameLength),
  servingNote: text(LIMITS.foodNameLength).nullable(),
  kcal: num(0, LIMITS.kcalPerItemMax),
  proteinG: num(0, LIMITS.pfcPerItemMax),
  fatG: num(0, LIMITS.pfcPerItemMax),
  carbsG: num(0, LIMITS.pfcPerItemMax),
  useCount: z.number().int().min(0),
  createdAt: ts,
  updatedAt: ts,
});

const mealEntrySchema = z.object({
  id,
  date,
  mealType: z.enum(MEAL_TYPES),
  sortOrder: z.number().int(),
  foodName: z.string().min(1).max(LIMITS.foodNameLength),
  amountNote: text(LIMITS.foodNameLength).nullable(),
  foodId: id.nullable(),
  multiplier: z.number().gt(0).max(LIMITS.multiplierMax).nullable(),
  kcal: num(0, LIMITS.kcalPerItemMax),
  proteinG: num(0, LIMITS.pfcPerItemMax),
  fatG: num(0, LIMITS.pfcPerItemMax),
  carbsG: num(0, LIMITS.pfcPerItemMax),
  memo: text(LIMITS.memoLength).nullable(),
  createdAt: ts,
  updatedAt: ts,
});

const goalSchema = z.object({
  id,
  startDate: date,
  kcal: z.number().int().min(LIMITS.goalKcal.min).max(LIMITS.goalKcal.max),
  proteinG: num(0, LIMITS.pfcPerItemMax),
  fatG: num(0, LIMITS.pfcPerItemMax),
  carbsG: num(0, LIMITS.goalCarbsMax),
  targetWeightKg: num(LIMITS.weightKg.min, LIMITS.weightKg.max).nullable(),
  targetBodyFatPct: num(LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max).nullable(),
  targetDate: date.nullable(),
  createdAt: ts,
});

const unique = <T>(items: T[], key: (t: T) => unknown) => new Set(items.map(key)).size === items.length;

export const exportSchema = z
  .object({
    app: z.literal(EXPORT_APP, { message: 'Power のエクスポートファイルではありません' }),
    version: z.literal(EXPORT_VERSION, { message: 'このバージョンのファイルには対応していません' }),
    exportedAt: z.string().optional(),
    profile: profileSchema,
    bodyLogs: z.array(bodyLogSchema),
    foods: z.array(foodSchema),
    mealEntries: z.array(mealEntrySchema),
    goals: z.array(goalSchema),
  })
  .superRefine((v, ctx) => {
    const dup = (path: string, ok: boolean) =>
      ok || ctx.addIssue({ code: 'custom', path: [path], message: '同じデータが重複しています' });
    dup('bodyLogs', unique(v.bodyLogs, (b) => b.date));
    dup('foods', unique(v.foods, (f) => f.id));
    dup('mealEntries', unique(v.mealEntries, (m) => m.id));
    dup('goals', unique(v.goals, (g) => g.id) && unique(v.goals, (g) => g.startDate));
    const foodIds = new Set(v.foods.map((f) => f.id));
    v.mealEntries.forEach((m, i) => {
      if (m.foodId != null && !foodIds.has(m.foodId)) {
        ctx.addIssue({ code: 'custom', path: ['mealEntries', i, 'foodId'], message: '存在しない食品を参照しています' });
      }
    });
  });
export type ExportData = z.infer<typeof exportSchema>;

export type ImportResult = {
  imported: { bodyLogs: number; foods: number; mealEntries: number; goals: number };
  backupFile: string;
};

type Rec = Record<string, unknown>;

export class TransferService {
  constructor(
    private db: Db,
    private backups: BackupService,
  ) {}

  exportAll(): ExportData {
    const all = (sql: string) => this.db.prepare(sql).all() as Rec[];
    const p = this.db.prepare('SELECT * FROM profile WHERE id = 1').get() as Rec;
    return {
      app: EXPORT_APP,
      version: EXPORT_VERSION,
      exportedAt: nowIso(),
      profile: {
        sex: p.sex as 'male' | 'female' | null,
        birthDate: p.birth_date as string | null,
        heightCm: p.height_cm as number | null,
        bmrKcal: p.bmr_kcal as number | null,
        activityLevel: p.activity_level as number,
        deficitPct: p.deficit_pct as number,
        proteinPerKg: p.protein_per_kg as number,
        fatPct: p.fat_pct as number,
        updatedAt: p.updated_at as string,
      },
      bodyLogs: all('SELECT * FROM body_logs ORDER BY date').map((r) => ({
        date: r.date as string,
        weightKg: r.weight_kg as number | null,
        bodyFatPct: r.body_fat_pct as number | null,
        memo: r.memo as string | null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      })),
      foods: all('SELECT * FROM foods ORDER BY id').map((r) => ({
        id: r.id as number,
        name: r.name as string,
        servingNote: r.serving_note as string | null,
        kcal: r.kcal as number,
        proteinG: r.protein_g as number,
        fatG: r.fat_g as number,
        carbsG: r.carbs_g as number,
        useCount: r.use_count as number,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      })),
      mealEntries: all('SELECT * FROM meal_entries ORDER BY date, id').map((r) => ({
        id: r.id as number,
        date: r.date as string,
        mealType: r.meal_type as ExportData['mealEntries'][number]['mealType'],
        sortOrder: r.sort_order as number,
        foodName: r.food_name as string,
        amountNote: r.amount_note as string | null,
        foodId: r.food_id as number | null,
        multiplier: r.multiplier as number | null,
        kcal: r.kcal as number,
        proteinG: r.protein_g as number,
        fatG: r.fat_g as number,
        carbsG: r.carbs_g as number,
        memo: r.memo as string | null,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      })),
      goals: all('SELECT * FROM goals ORDER BY start_date').map((r) => ({
        id: r.id as number,
        startDate: r.start_date as string,
        kcal: r.kcal as number,
        proteinG: r.protein_g as number,
        fatG: r.fat_g as number,
        carbsG: r.carbs_g as number,
        targetWeightKg: r.target_weight_kg as number | null,
        targetBodyFatPct: r.target_body_fat_pct as number | null,
        targetDate: r.target_date as string | null,
        createdAt: r.created_at as string,
      })),
    };
  }

  /** 検証済みのデータで全データを置き換える。事前にバックアップし、1 トランザクションで行う */
  importAll(data: ExportData): ImportResult {
    const backupFile = this.backups.createPreImport();
    const db = this.db;
    try {
      transaction(db, () => {
        // 食事 → 食品の順に消す（外部キー）
        for (const t of ['meal_entries', 'foods', 'body_logs', 'goals']) db.exec(`DELETE FROM ${t}`);

        const p = data.profile;
        db.prepare(
          `UPDATE profile SET sex = ?, birth_date = ?, height_cm = ?, bmr_kcal = ?, activity_level = ?,
             deficit_pct = ?, protein_per_kg = ?, fat_pct = ?, updated_at = ? WHERE id = 1`,
        ).run(p.sex, p.birthDate, p.heightCm, p.bmrKcal, p.activityLevel, p.deficitPct, p.proteinPerKg, p.fatPct, p.updatedAt);

        const body = db.prepare(
          'INSERT INTO body_logs (date, weight_kg, body_fat_pct, memo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        );
        for (const b of data.bodyLogs) body.run(b.date, b.weightKg, b.bodyFatPct, b.memo, b.createdAt, b.updatedAt);

        const food = db.prepare(
          `INSERT INTO foods (id, name, serving_note, kcal, protein_g, fat_g, carbs_g, use_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const f of data.foods) {
          food.run(f.id, f.name, f.servingNote, f.kcal, f.proteinG, f.fatG, f.carbsG, f.useCount, f.createdAt, f.updatedAt);
        }

        const meal = db.prepare(
          `INSERT INTO meal_entries (id, date, meal_type, sort_order, food_name, amount_note, food_id, multiplier,
             kcal, protein_g, fat_g, carbs_g, memo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const m of data.mealEntries) {
          meal.run(m.id, m.date, m.mealType, m.sortOrder, m.foodName, m.amountNote, m.foodId, m.multiplier,
            m.kcal, m.proteinG, m.fatG, m.carbsG, m.memo, m.createdAt, m.updatedAt);
        }

        const goal = db.prepare(
          `INSERT INTO goals (id, start_date, kcal, protein_g, fat_g, carbs_g, target_weight_kg, target_body_fat_pct, target_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const g of data.goals) {
          goal.run(g.id, g.startDate, g.kcal, g.proteinG, g.fatG, g.carbsG, g.targetWeightKg, g.targetBodyFatPct, g.targetDate, g.createdAt);
        }
      });
    } catch (e) {
      // 検証をすり抜けた制約違反など。ロールバック済みなので元のデータのまま
      throw new HttpError(400, 'IMPORT_FAILED', `取り込めないデータが含まれていたため、何も変更していません（${(e as Error).message}）`);
    }
    return {
      imported: {
        bodyLogs: data.bodyLogs.length,
        foods: data.foods.length,
        mealEntries: data.mealEntries.length,
        goals: data.goals.length,
      },
      backupFile,
    };
  }
}
