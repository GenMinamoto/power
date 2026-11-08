import { z } from 'zod';
import { ACTIVITY_LEVELS, LIMITS, MEAL_TYPES } from './constants.js';
import { isValidDate, today } from './date.js';

export const dateSchema = z.string().refine(isValidDate, { message: '日付は YYYY-MM-DD 形式で入力してください' });

const range = (min: number, max: number) =>
  z
    .number({ message: '数値を入力してください' })
    .min(min, { message: `${min}〜${max}の範囲で入力してください` })
    .max(max, { message: `${min}〜${max}の範囲で入力してください` });

export const bodyLogInputSchema = z
  .object({
    weightKg: range(LIMITS.weightKg.min, LIMITS.weightKg.max).nullable(),
    bodyFatPct: range(LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max).nullable(),
    memo: z.string().max(LIMITS.memoLength, { message: `${LIMITS.memoLength}文字以内で入力してください` }).nullable(),
  })
  .refine((v) => v.weightKg != null || v.bodyFatPct != null, {
    message: '体重か体脂肪率のどちらかを入力してください',
    path: ['weightKg'],
  });
export type BodyLogInput = z.infer<typeof bodyLogInputSchema>;

export const mealEntryInputSchema = z.object({
  date: dateSchema,
  mealType: z.enum(MEAL_TYPES, { message: '区分を選んでください' }),
  foodName: z
    .string()
    .trim()
    .min(1, { message: '食品名を入力してください' })
    .max(LIMITS.foodNameLength, { message: `${LIMITS.foodNameLength}文字以内で入力してください` }),
  amountNote: z.string().trim().max(LIMITS.foodNameLength, { message: `${LIMITS.foodNameLength}文字以内で入力してください` }).nullable(),
  foodId: z.number().int().positive().nullable(),
  multiplier: z
    .number({ message: '数値を入力してください' })
    .gt(0, { message: '0より大きい値を入力してください' })
    .max(LIMITS.multiplierMax, { message: `${LIMITS.multiplierMax}以下で入力してください` })
    .nullable(),
  /** null の場合は PFC から計算する */
  kcal: range(0, LIMITS.kcalPerItemMax).nullable(),
  proteinG: range(0, LIMITS.pfcPerItemMax),
  fatG: range(0, LIMITS.pfcPerItemMax),
  carbsG: range(0, LIMITS.pfcPerItemMax),
  memo: z.string().max(LIMITS.memoLength, { message: `${LIMITS.memoLength}文字以内で入力してください` }).nullable(),
});
export type MealEntryInput = z.infer<typeof mealEntryInputSchema>;

export const foodInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: '食品名を入力してください' })
    .max(LIMITS.foodNameLength, { message: `${LIMITS.foodNameLength}文字以内で入力してください` }),
  servingNote: z.string().trim().max(LIMITS.foodNameLength, { message: `${LIMITS.foodNameLength}文字以内で入力してください` }).nullable(),
  /** null の場合は PFC から計算する */
  kcal: range(0, LIMITS.kcalPerItemMax).nullable(),
  proteinG: range(0, LIMITS.pfcPerItemMax),
  fatG: range(0, LIMITS.pfcPerItemMax),
  carbsG: range(0, LIMITS.pfcPerItemMax),
});
export type FoodInput = z.infer<typeof foodInputSchema>;

export const foodQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export const copyMealsSchema = z
  .object({
    fromDate: dateSchema,
    toDate: dateSchema,
    /** null なら全区分 */
    mealType: z.enum(MEAL_TYPES).nullable(),
  })
  .refine((v) => v.fromDate !== v.toDate, { message: 'コピー元とコピー先が同じ日です', path: ['fromDate'] });
export type CopyMealsInput = z.infer<typeof copyMealsSchema>;

const optionalRange = (min: number, max: number) => range(min, max).nullable();

export const profileInputSchema = z.object({
  sex: z.enum(['male', 'female'], { message: '性別を選んでください' }).nullable(),
  birthDate: dateSchema
    .refine((d) => d >= '1900-01-01' && d <= today(), { message: '生年月日を確認してください' })
    .nullable(),
  heightCm: optionalRange(LIMITS.heightCm.min, LIMITS.heightCm.max),
  bmrKcal: optionalRange(LIMITS.bmrKcal.min, LIMITS.bmrKcal.max),
  activityLevel: z
    .number({ message: '活動レベルを選んでください' })
    .refine((v) => ACTIVITY_LEVELS.some((a) => a.value === v), { message: '活動レベルを選んでください' }),
  deficitPct: range(LIMITS.deficitPct.min, LIMITS.deficitPct.max),
  proteinPerKg: range(LIMITS.proteinPerKg.min, LIMITS.proteinPerKg.max),
  fatPct: range(LIMITS.fatPct.min, LIMITS.fatPct.max),
});
export type ProfileInput = z.infer<typeof profileInputSchema>;

export const goalInputSchema = z
  .object({
    startDate: dateSchema,
    kcal: range(LIMITS.goalKcal.min, LIMITS.goalKcal.max),
    proteinG: range(0, LIMITS.pfcPerItemMax),
    fatG: range(0, LIMITS.pfcPerItemMax),
    carbsG: range(0, LIMITS.goalCarbsMax),
    targetWeightKg: optionalRange(LIMITS.weightKg.min, LIMITS.weightKg.max),
    targetBodyFatPct: optionalRange(LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max),
    targetDate: dateSchema.nullable(),
  })
  .refine((v) => v.targetDate == null || v.targetDate > v.startDate, {
    message: '目標期日は適用開始日より後の日にしてください',
    path: ['targetDate'],
  });
export type GoalInput = z.infer<typeof goalInputSchema>;

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const dateQuerySchema = z.object({ date: dateSchema });
export const dateParamSchema = z.object({ date: dateSchema });
