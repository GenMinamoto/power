export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'other'] as const;
export type MealType = (typeof MEAL_TYPES)[number];
export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
  other: 'その他',
};

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'ほぼ運動しない（デスクワーク中心）' },
  { value: 1.375, label: '軽い運動（週1〜3回）' },
  { value: 1.55, label: '中程度の運動（週3〜5回）' },
  { value: 1.725, label: '激しい運動（週6〜7回）' },
  { value: 1.9, label: '非常に激しい（肉体労働＋毎日のトレーニング）' },
] as const;

export const DEFICIT_OPTIONS = [
  { value: 0, label: '維持（0%）' },
  { value: 10, label: 'ゆるやか（−10%）' },
  { value: 20, label: '標準（−20%）' },
] as const;

export const DEFAULTS = {
  activityLevel: 1.55,
  deficitPct: 20,
  proteinPerKg: 2.0,
  fatPct: 20,
} as const;

export const LIMITS = {
  weightKg: { min: 20, max: 300 },
  bodyFatPct: { min: 2, max: 70 },
  memoLength: 500,
  foodNameLength: 100,
  kcalPerItemMax: 5000,
  pfcPerItemMax: 500,
  multiplierMax: 20,
  heightCm: { min: 100, max: 250 },
  bmrKcal: { min: 500, max: 5000 },
  deficitPct: { min: 0, max: 30 },
  proteinPerKg: { min: 1.0, max: 3.0 },
  fatPct: { min: 15, max: 40 },
  goalKcal: { min: 800, max: 6000 },
  goalCarbsMax: 1000,
} as const;

/** 体重の 7 日平均の週あたり変化（体重比 %）の目安。これより速く減ると筋肉が落ちやすい */
export const PACE_GUIDE = { fastPct: -1.0, slowPct: -0.5 } as const;

/** 1品のカロリーがこれを超えたら保存前に確認する */
export const KCAL_PER_ITEM_WARN = 1500;

/** 体重がこれ以上変化したら保存前に確認する（kg） */
export const WEIGHT_JUMP_WARN_KG = 3;
/** 体脂肪率の測定お知らせを出すまでの日数 */
export const BODY_FAT_REMINDER_DAYS = 14;
/** 移動平均の日数と、値を出すのに必要な最小記録数 */
export const MA_WINDOW = 7;
export const MA_MIN_POINTS = 4;
/** 自動バックアップの保持世代数 */
export const BACKUP_KEEP = 30;
export const PRE_IMPORT_BACKUP_KEEP = 5;
