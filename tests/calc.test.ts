import { describe, expect, it } from 'vitest';
import {
  applyMultiplier,
  bmrMifflin,
  fatMass,
  kcalFromPfc,
  kcalMismatch,
  leanBodyMass,
  movingAverage,
  sumNutrients,
  targetPlan,
  weeklyPace,
  type PlanInput,
} from '../src/shared/calc';

describe('体組成', () => {
  it('除脂肪体重と体脂肪量', () => {
    expect(leanBodyMass(75, 18)).toBe(61.5);
    expect(fatMass(75, 18)).toBe(13.5);
    expect(leanBodyMass(74.8, 18.2)).toBe(61.2);
    expect(fatMass(74.8, 18.2)).toBe(13.6);
  });
});

describe('movingAverage', () => {
  const pts = (vals: (number | null)[]) => vals.map((value, i) => ({ date: `d${i}`, value }));

  it('7日すべて記録あり', () => {
    const r = movingAverage(pts([70, 71, 72, 73, 74, 75, 76]));
    expect(r[6]!.value).toBe(73);
  });

  it('記録が4日以上なら平均を出し、3日以下なら null', () => {
    const r = movingAverage(pts([70, null, 72, null, 74, 76, null]));
    expect(r[5]!.value).toBe(73); // 70,72,74,76
    expect(r[4]!.value).toBeNull(); // 70,72,74 の 3 日
  });

  it('7日より前の値は含めない', () => {
    const r = movingAverage(pts([100, 70, 70, 70, 70, 70, 70, 70]));
    expect(r[7]!.value).toBe(70);
  });
});

describe('栄養', () => {
  it('PFC から kcal', () => {
    expect(kcalFromPfc(10, 5, 20)).toBe(165);
  });

  it('kcal と PFC のずれ判定', () => {
    expect(kcalMismatch(165, 10, 5, 20)).toBe(false);
    expect(kcalMismatch(180, 10, 5, 20)).toBe(false); // 差 15kcal
    expect(kcalMismatch(250, 10, 5, 20)).toBe(true);
    expect(kcalMismatch(10, 1, 0, 1)).toBe(false); // 差 2kcal
  });

  it('倍率', () => {
    const egg = { kcal: 80, proteinG: 6.2, fatG: 5.1, carbsG: 0.2 };
    expect(applyMultiplier(egg, 2)).toEqual({ kcal: 160, proteinG: 12.4, fatG: 10.2, carbsG: 0.4 });
    expect(applyMultiplier(egg, 0.5)).toEqual({ kcal: 40, proteinG: 3.1, fatG: 2.6, carbsG: 0.1 });
    expect(applyMultiplier(egg, 1.5)).toEqual({ kcal: 120, proteinG: 9.3, fatG: 7.7, carbsG: 0.3 });
  });

  it('合計', () => {
    expect(
      sumNutrients([
        { kcal: 150, proteinG: 5.4, fatG: 2.3, carbsG: 27.6 },
        { kcal: 160, proteinG: 12.4, fatG: 10.2, carbsG: 0.4 },
      ]),
    ).toEqual({ kcal: 310, proteinG: 17.8, fatG: 12.5, carbsG: 28 });
  });
});

describe('目安計算', () => {
  const base: PlanInput = {
    sex: 'male',
    age: 30,
    heightCm: 175,
    weightKg: 75,
    bmrKcal: null,
    activityLevel: 1.55,
    deficitPct: 20,
    proteinPerKg: 2.0,
    fatPct: 20,
  };

  it('Mifflin-St Jeor 式', () => {
    expect(bmrMifflin('male', 75, 175, 30)).toBe(1699);
    expect(bmrMifflin('female', 55, 160, 30)).toBe(1239); // 550+1000-150-161
  });

  it('設計書の計算例1：男性30歳175cm75kg', () => {
    expect(targetPlan(base)).toEqual({
      ok: true,
      bmr: 1699,
      bmrSource: 'mifflin',
      tdee: 2633,
      targetKcal: 2106,
      proteinG: 150,
      fatG: 47,
      carbsG: 271,
      warnings: [],
    });
  });

  it('設計書の計算例2：基礎代謝1800を入力', () => {
    expect(targetPlan({ ...base, bmrKcal: 1800 })).toMatchObject({
      bmr: 1800,
      bmrSource: 'input',
      tdee: 2790,
      targetKcal: 2232,
      proteinG: 150,
      fatG: 50,
      carbsG: 296,
    });
  });

  it('基礎代謝を入力すればプロフィールが無くても計算できる', () => {
    expect(targetPlan({ ...base, sex: null, age: null, heightCm: null, bmrKcal: 1800 }).ok).toBe(true);
  });

  it('プロフィール不足', () => {
    expect(targetPlan({ ...base, sex: null })).toEqual({ ok: false, warnings: ['MISSING_PROFILE'] });
  });

  it('目標が基礎代謝を下回ると警告', () => {
    const r = targetPlan({ ...base, activityLevel: 1.2, deficitPct: 30 });
    expect(r.warnings).toContain('BELOW_BMR');
  });

  it('炭水化物がマイナスになると 0 にして警告', () => {
    const r = targetPlan({ ...base, bmrKcal: 900, activityLevel: 1.2, proteinPerKg: 3.0, fatPct: 40 });
    expect(r.warnings).toContain('CARBS_NEGATIVE');
    expect(r.ok && r.carbsG).toBe(0);
  });
});

describe('weeklyPace（7日平均の2週間の変化）', () => {
  const series = (start: number, perDay: number, n = 15) =>
    Array.from({ length: n }, (_, i): { date: string; weightMa7: number | null } => ({
      date: `d${i}`,
      weightMa7: round2(start + perDay * i),
    }));
  const round2 = (n: number) => Math.round(n * 100) / 100;

  it('週 0.5〜1% 減は good', () => {
    // 80kg → 2週間で −1.2kg → 週 −0.6kg（−0.75%）
    expect(weeklyPace(series(80, -1.2 / 14))).toMatchObject({ kgPerWeek: -0.6, pctPerWeek: -0.75, status: 'good' });
  });
  it('週 1% を超えて減ると fast、0.5% 未満は slow（増加も slow）', () => {
    expect(weeklyPace(series(80, -2.0 / 14))?.status).toBe('fast');
    expect(weeklyPace(series(80, -0.4 / 14))?.status).toBe('slow');
    expect(weeklyPace(series(80, 0.3 / 14))?.status).toBe('slow');
  });
  it('どちらかの7日平均が無い、または日数が足りなければ null', () => {
    const s = series(80, -0.1);
    s[0] = { ...s[0]!, weightMa7: null };
    expect(weeklyPace(s)).toBeNull();
    expect(weeklyPace(series(80, -0.1, 14))).toBeNull();
  });
});