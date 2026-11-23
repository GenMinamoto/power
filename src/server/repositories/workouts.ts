import { estimateWorkoutKcal, round, workoutBonus } from '../../shared/calc.js';
import type { WorkoutKind } from '../../shared/constants.js';
import type { HealthWorkoutInput, WorkoutInput } from '../../shared/schemas.js';
import type { DayWorkouts, Workout, WorkoutBonus } from '../../shared/types.js';
import { nowIso, transaction, type SqlDb as Db } from '../dbCore.js';
import { HttpError, notFound } from '../errors.js';

type Row = {
  id: number;
  date: string;
  kind: WorkoutKind;
  name: string;
  duration_min: number | null;
  distance_km: number | null;
  kcal: number;
  source: 'manual' | 'health';
  memo: string | null;
};

const toWorkout = (r: Row): Workout => ({
  id: r.id,
  date: r.date,
  kind: r.kind,
  name: r.name,
  durationMin: r.duration_min,
  distanceKm: r.distance_km,
  kcal: r.kcal,
  source: r.source,
  memo: r.memo,
});

const opt = (v: number | null, digits: number) => (v == null ? null : round(v, digits));

export class WorkoutRepository {
  constructor(private db: Db) {}

  get(id: number): Workout | null {
    const r = this.db.prepare('SELECT * FROM workouts WHERE id = ?').get(id) as Row | undefined;
    return r ? toWorkout(r) : null;
  }

  listByDate(date: string): Workout[] {
    return (this.db.prepare('SELECT * FROM workouts WHERE date = ? ORDER BY id').all(date) as Row[]).map(toWorkout);
  }

  /** from〜to の日ごとの消費合計 */
  dailyKcal(from: string, to: string): Map<string, number> {
    const rows = this.db
      .prepare('SELECT date, SUM(kcal) AS kcal FROM workouts WHERE date BETWEEN ? AND ? GROUP BY date')
      .all(from, to) as { date: string; kcal: number }[];
    return new Map(rows.map((r) => [r.date, Math.round(r.kcal)]));
  }

  /** その日の運動による「食べてよい量」の上乗せ。減量ペースはプロフィールの値を使う */
  bonus(date: string): WorkoutBonus {
    const workoutKcal = this.dailyKcal(date, date).get(date) ?? 0;
    const deficitPct = this.deficitPct();
    const b = workoutBonus(workoutKcal, deficitPct);
    return { workoutKcal, bonusKcal: b.kcal, bonusCarbsG: b.carbsG, deficitPct };
  }

  deficitPct(): number {
    return (this.db.prepare('SELECT deficit_pct FROM profile WHERE id = 1').get() as { deficit_pct: number }).deficit_pct;
  }

  day(date: string): DayWorkouts {
    return { date, entries: this.listByDate(date), bonus: this.bonus(date) };
  }

  create(input: WorkoutInput): Workout {
    const v = this.normalize(input);
    const now = nowIso();
    const res = this.db
      .prepare(
        `INSERT INTO workouts (date, kind, name, duration_min, distance_km, kcal, source, memo, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?)`,
      )
      .run(v.date, v.kind, v.name, v.durationMin, v.distanceKm, v.kcal, v.memo, now, now);
    return this.get(Number(res.lastInsertRowid))!;
  }

  update(id: number, input: WorkoutInput): Workout {
    const v = this.normalize(input);
    const res = this.db
      .prepare(
        `UPDATE workouts SET date = ?, kind = ?, name = ?, duration_min = ?, distance_km = ?, kcal = ?, memo = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(v.date, v.kind, v.name, v.durationMin, v.distanceKm, v.kcal, v.memo, nowIso(), id);
    if (res.changes === 0) throw notFound('この運動の記録は見つかりません');
    return this.get(id)!;
  }

  /**
   * ヘルスケアからの取り込み。同じ日・種目・名前で取り込み済みの記録があれば上書きする
   * （ショートカットを同じ日に何度実行しても二重にならない）。手入力の記録には触れない
   */
  importHealth(input: HealthWorkoutInput): { entry: Workout; replaced: boolean } {
    return transaction(this.db, () => {
      const cur = this.db
        .prepare(`SELECT id FROM workouts WHERE date = ? AND kind = ? AND name = ? AND source = 'health' ORDER BY id LIMIT 1`)
        .get(input.date, input.kind, input.name.trim()) as { id: number } | undefined;
      const now = nowIso();
      const vals = [
        input.date,
        input.kind,
        input.name.trim(),
        opt(input.durationMin, 0),
        opt(input.distanceKm, 2),
        Math.round(input.kcal),
      ] as const;
      if (cur) {
        this.db
          .prepare(
            `UPDATE workouts SET date = ?, kind = ?, name = ?, duration_min = ?, distance_km = ?, kcal = ?, updated_at = ? WHERE id = ?`,
          )
          .run(...vals, now, cur.id);
        return { entry: this.get(cur.id)!, replaced: true };
      }
      const res = this.db
        .prepare(
          `INSERT INTO workouts (date, kind, name, duration_min, distance_km, kcal, source, memo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'health', NULL, ?, ?)`,
        )
        .run(...vals, now, now);
      return { entry: this.get(Number(res.lastInsertRowid))!, replaced: false };
    });
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM workouts WHERE id = ?').run(id).changes > 0;
  }

  /** 保存前の整形。kcal が空なら、その日以前の最新の体重から目安を計算する */
  private normalize(input: WorkoutInput) {
    const durationMin = opt(input.durationMin, 0);
    const distanceKm = opt(input.distanceKm, 2);
    let kcal = input.kcal == null ? null : Math.round(input.kcal);
    if (kcal == null) {
      const w = this.db
        .prepare(
          `SELECT weight_kg FROM body_logs WHERE weight_kg IS NOT NULL
           ORDER BY (date > ?), CASE WHEN date <= ? THEN date END DESC, date LIMIT 1`,
        )
        .get(input.date, input.date) as { weight_kg: number } | undefined;
      kcal = estimateWorkoutKcal(input.kind, w?.weight_kg ?? null, durationMin, distanceKm);
      if (kcal == null) {
        const why = w == null ? '体重の記録がないため' : '時間か距離がないため';
        throw new HttpError(400, 'VALIDATION_ERROR', `${why}消費カロリーを計算できません。消費カロリーを入力してください`);
      }
    }
    return {
      date: input.date,
      kind: input.kind,
      name: input.name.trim(),
      durationMin,
      distanceKm,
      kcal,
      memo: input.memo?.trim() || null,
    };
  }
}
