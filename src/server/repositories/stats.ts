import { BODY_FAT_REMINDER_DAYS, MA_WINDOW } from '../../shared/constants.js';
import { movingAverage, round } from '../../shared/calc.js';
import { addDays, diffDays, rangeDays } from '../../shared/date.js';
import type { Dashboard, DailyStat } from '../../shared/types.js';
import type { Db } from '../db.js';
import { BodyLogRepository } from './bodyLogs.js';
import { GoalRepository } from './goals.js';
import { MealRepository } from './meals.js';

type GoalRow = {
  start_date: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  target_weight_kg: number | null;
};

export class StatsRepository {
  private bodyLogs: BodyLogRepository;
  private meals: MealRepository;
  private goals: GoalRepository;

  constructor(private db: Db) {
    this.bodyLogs = new BodyLogRepository(db);
    this.meals = new MealRepository(db);
    this.goals = new GoalRepository(db);
  }

  /** 最初の記録日（体組成・食事のうち早い方）。記録がなければ null */
  firstRecordDate(): string | null {
    const r = this.db
      .prepare('SELECT MIN(d) AS d FROM (SELECT MIN(date) AS d FROM body_logs UNION ALL SELECT MIN(date) FROM meal_entries)')
      .get() as { d: string | null };
    return r.d;
  }

  /** from〜to の全日について、体組成・食事合計・目標をまとめて返す（記録のない日は null） */
  daily(from: string, to: string): DailyStat[] {
    if (from > to) return [];
    // 7 日平均を期間の先頭から正しく出すため、6 日前から読み込む
    const loadFrom = addDays(from, -(MA_WINDOW - 1));
    const bodyMap = new Map(this.bodyLogs.list(loadFrom, to).map((b) => [b.date, b]));

    const mealRows = this.db
      .prepare(
        `SELECT date, SUM(kcal) AS kcal, SUM(protein_g) AS p, SUM(fat_g) AS f, SUM(carbs_g) AS c, COUNT(*) AS n
         FROM meal_entries WHERE date BETWEEN ? AND ? GROUP BY date`,
      )
      .all(from, to) as { date: string; kcal: number; p: number; f: number; c: number; n: number }[];
    const mealMap = new Map(mealRows.map((m) => [m.date, m]));

    const goals = this.db.prepare('SELECT * FROM goals ORDER BY start_date').all() as GoalRow[];

    const allDays = rangeDays(loadFrom, to);
    const ma = movingAverage(allDays.map((d) => ({ date: d, value: bodyMap.get(d)?.weightKg ?? null })));
    const maMap = new Map(ma.map((m) => [m.date, m.value]));

    let gi = -1;
    return rangeDays(from, to).map((date) => {
      while (gi + 1 < goals.length && goals[gi + 1]!.start_date <= date) gi++;
      const goal = gi >= 0 ? goals[gi]! : null;
      const b = bodyMap.get(date);
      const m = mealMap.get(date);
      return {
        date,
        weightKg: b?.weightKg ?? null,
        weightMa7: maMap.get(date) ?? null,
        bodyFatPct: b?.bodyFatPct ?? null,
        leanBodyMassKg: b?.leanBodyMassKg ?? null,
        fatMassKg: b?.fatMassKg ?? null,
        kcal: m ? Math.round(m.kcal) : null,
        proteinG: m ? round(m.p, 1) : null,
        fatG: m ? round(m.f, 1) : null,
        carbsG: m ? round(m.c, 1) : null,
        mealCount: m?.n ?? 0,
        goalKcal: goal?.kcal ?? null,
        goalProteinG: goal?.protein_g ?? null,
        goalFatG: goal?.fat_g ?? null,
        goalCarbsG: goal?.carbs_g ?? null,
        goalWeightKg: goal?.target_weight_kg ?? null,
      };
    });
  }

  dashboard(date: string): Dashboard {
    const weights = this.bodyLogs.latestWeights(date);
    const latest = weights[0] ?? null;
    const prev = weights[1] ?? null;

    const days = this.daily(addDays(date, -7), date);
    const ma7 = days.at(-1)?.weightMa7 ?? null;
    const ma7LastWeek = days[0]?.weightMa7 ?? null;

    const fat = this.bodyLogs.latestBodyFat(date);
    const daysSince = fat ? diffDays(fat.date, date) : null;

    return {
      date,
      weight: {
        latest: latest?.weightKg ?? null,
        latestDate: latest?.date ?? null,
        diffFromPrev: latest && prev ? round(latest.weightKg - prev.weightKg, 1) : null,
        ma7,
        ma7DiffFromLastWeek: ma7 != null && ma7LastWeek != null ? round(ma7 - ma7LastWeek, 1) : null,
      },
      bodyFat: {
        latest: fat?.bodyFatPct ?? null,
        latestDate: fat?.date ?? null,
        daysSince,
        reminder: daysSince == null || daysSince >= BODY_FAT_REMINDER_DAYS,
        leanBodyMassKg: fat?.leanBodyMassKg ?? null,
        fatMassKg: fat?.fatMassKg ?? null,
      },
      intake: this.meals.total(date),
      goal: this.goals.effective(date),
    };
  }
}
