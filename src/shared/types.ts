import type { Nutrients, Sex } from './calc.js';
import type { MealType } from './constants.js';

export type { MealType, Nutrients, Sex };

export type BodyLog = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  memo: string | null;
  /** 体重と体脂肪率の両方がある日のみ */
  leanBodyMassKg: number | null;
  fatMassKg: number | null;
};

export type BodyFatPoint = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number;
  leanBodyMassKg: number | null;
  fatMassKg: number | null;
};

export type BodyLogDetail = {
  log: BodyLog | null;
  /** その日より前の最新の体脂肪率測定 */
  previousBodyFat: BodyFatPoint | null;
  /** その日より前の最新の体重 */
  previousWeight: { date: string; weightKg: number } | null;
};

export type MealEntry = {
  id: number;
  date: string;
  mealType: MealType;
  sortOrder: number;
  foodName: string;
  amountNote: string | null;
  foodId: number | null;
  multiplier: number | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  memo: string | null;
};

export type Food = {
  id: number;
  name: string;
  servingNote: string | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  useCount: number;
};

export type Goal = {
  id: number;
  startDate: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
  targetDate: string | null;
};

export type Profile = {
  sex: Sex | null;
  birthDate: string | null;
  heightCm: number | null;
  /** 体組成計などで測った基礎代謝（任意） */
  bmrKcal: number | null;
  activityLevel: number;
  deficitPct: number;
  proteinPerKg: number;
  fatPct: number;
};

export type DayMeals = {
  date: string;
  entries: MealEntry[];
  subtotals: Record<MealType, Nutrients>;
  total: Nutrients;
  /** その日に適用される目標（未設定なら null） */
  goal: Goal | null;
};

export type DailyStat = {
  date: string;
  weightKg: number | null;
  weightMa7: number | null;
  bodyFatPct: number | null;
  leanBodyMassKg: number | null;
  fatMassKg: number | null;
  kcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  mealCount: number;
  goalKcal: number | null;
  goalProteinG: number | null;
  goalFatG: number | null;
  goalCarbsG: number | null;
  goalWeightKg: number | null;
};

/** 月曜始まりの週ごとの平均。平均は記録のある日だけで計算する */
export type WeeklyStat = {
  weekStart: string;
  avgWeightKg: number | null;
  avgBodyFatPct: number | null;
  avgKcal: number | null;
  avgProteinG: number | null;
  avgFatG: number | null;
  avgCarbsG: number | null;
  /** 体重を記録した日数 */
  weightDays: number;
  /** 食事を記録した日数 */
  mealDays: number;
  /** 前週の平均体重との差 */
  diffWeightKg: number | null;
};

export type Dashboard = {
  date: string;
  weight: {
    latest: number | null;
    latestDate: string | null;
    diffFromPrev: number | null;
    ma7: number | null;
    ma7DiffFromLastWeek: number | null;
  };
  bodyFat: {
    latest: number | null;
    latestDate: string | null;
    daysSince: number | null;
    reminder: boolean;
    leanBodyMassKg: number | null;
    fatMassKg: number | null;
  };
  /** その日の摂取合計（食事の記録がなければ 0） */
  intake: Nutrients & { count: number };
  goal: Goal | null;
};

export type BackupInfo = { file: string; createdAt: string; sizeBytes: number };

export type ApiErrorBody = {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
};
