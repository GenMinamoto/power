import { z } from 'zod';
import { LIMITS } from './constants.js';
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

export const rangeQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const dateQuerySchema = z.object({ date: dateSchema });
export const dateParamSchema = z.object({ date: dateSchema });
