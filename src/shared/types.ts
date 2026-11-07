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
};

export type BackupInfo = { file: string; createdAt: string; sizeBytes: number };

export type ApiErrorBody = {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
};
