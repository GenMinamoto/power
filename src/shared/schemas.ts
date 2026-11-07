import { z } from 'zod';
import { LIMITS, MEAL_TYPES } from './constants.js';
import { isValidDate } from './date.js';

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

export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const dateQuerySchema = z.object({ date: dateSchema });
export const dateParamSchema = z.object({ date: dateSchema });
