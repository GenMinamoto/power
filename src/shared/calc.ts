import { MA_MIN_POINTS, MA_WINDOW } from './constants.js';

export type Nutrients = { kcal: number; proteinG: number; fatG: number; carbsG: number };
export type Sex = 'male' | 'female';

export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  // 浮動小数の誤差（1.005 など）で丸めがずれないよう EPSILON を足す
  return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
}

// ── 体組成 ─────────────────────────────

export function leanBodyMass(weightKg: number, bodyFatPct: number): number {
  return round(weightKg * (1 - bodyFatPct / 100), 1);
}

export function fatMass(weightKg: number, bodyFatPct: number): number {
  return round((weightKg * bodyFatPct) / 100, 1);
}

/**
 * 移動平均。points は日付が連続していること（記録のない日は value=null）。
 * その日を含む直近 window 日のうち、記録が minPoints 以上ある日だけ平均を出す。
 */
export function movingAverage(
  points: { date: string; value: number | null }[],
  window: number = MA_WINDOW,
  minPoints: number = MA_MIN_POINTS,
): { date: string; value: number | null }[] {
  return points.map((p, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - window + 1); j <= i; j++) {
      const v = points[j]!.value;
      if (v != null) {
        sum += v;
        count++;
      }
    }
    return { date: p.date, value: count >= minPoints ? round(sum / count, 1) : null };
  });
}

// ── 栄養 ───────────────────────────────

export function kcalFromPfc(p: number, f: number, c: number): number {
  return Math.round(p * 4 + f * 9 + c * 4);
}

/** 入力 kcal と PFC から計算した kcal の差が大きいか（20kcal 超かつ 15% 超） */
export function kcalMismatch(kcal: number, p: number, f: number, c: number): boolean {
  const calc = kcalFromPfc(p, f, c);
  const d = Math.abs(kcal - calc);
  return d > 20 && d > Math.max(kcal, calc) * 0.15;
}

export function applyMultiplier(food: Nutrients, m: number): Nutrients {
  return {
    kcal: Math.round(food.kcal * m),
    proteinG: round(food.proteinG * m, 1),
    fatG: round(food.fatG * m, 1),
    carbsG: round(food.carbsG * m, 1),
  };
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const t = items.reduce(
    (a, x) => ({
      kcal: a.kcal + x.kcal,
      proteinG: a.proteinG + x.proteinG,
      fatG: a.fatG + x.fatG,
      carbsG: a.carbsG + x.carbsG,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
  return { kcal: Math.round(t.kcal), proteinG: round(t.proteinG, 1), fatG: round(t.fatG, 1), carbsG: round(t.carbsG, 1) };
}

// ── 目安計算 ───────────────────────────

/** Mifflin-St Jeor 式による基礎代謝 */
export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161));
}

export type PlanInput = {
  sex: Sex | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number;
  bmrKcal: number | null;
  activityLevel: number;
  deficitPct: number;
  proteinPerKg: number;
  fatPct: number;
};

export type PlanWarning = 'BELOW_BMR' | 'CARBS_NEGATIVE' | 'MISSING_PROFILE';

export type PlanResult =
  | { ok: false; warnings: PlanWarning[] }
  | {
      ok: true;
      bmr: number;
      bmrSource: 'input' | 'mifflin';
      tdee: number;
      targetKcal: number;
      proteinG: number;
      fatG: number;
      carbsG: number;
      warnings: PlanWarning[];
    };

export function targetPlan(input: PlanInput): PlanResult {
  let bmr: number;
  let bmrSource: 'input' | 'mifflin';
  if (input.bmrKcal != null) {
    bmr = Math.round(input.bmrKcal);
    bmrSource = 'input';
  } else if (input.sex != null && input.age != null && input.heightCm != null) {
    bmr = bmrMifflin(input.sex, input.weightKg, input.heightCm, input.age);
    bmrSource = 'mifflin';
  } else {
    return { ok: false, warnings: ['MISSING_PROFILE'] };
  }

  const warnings: PlanWarning[] = [];
  // 画面に表示する途中経過（BMR・TDEE）と一致するよう、各段階で丸めてから次に進む
  const tdee = Math.round(bmr * input.activityLevel);
  const targetKcal = Math.round(tdee * (1 - input.deficitPct / 100));
  const proteinG = Math.round(input.weightKg * input.proteinPerKg);
  const fatG = Math.round((targetKcal * input.fatPct) / 100 / 9);
  let carbsG = Math.round((targetKcal - proteinG * 4 - fatG * 9) / 4);
  if (targetKcal < bmr) warnings.push('BELOW_BMR');
  if (carbsG < 0) {
    warnings.push('CARBS_NEGATIVE');
    carbsG = 0;
  }
  return { ok: true, bmr, bmrSource, tdee, targetKcal, proteinG, fatG, carbsG, warnings };
}
