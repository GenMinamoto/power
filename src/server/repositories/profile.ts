import { round } from '../../shared/calc.js';
import type { ProfileInput } from '../../shared/schemas.js';
import type { Profile, Sex } from '../../shared/types.js';
import { nowIso, type Db } from '../db.js';

type Row = {
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  bmr_kcal: number | null;
  activity_level: number;
  deficit_pct: number;
  protein_per_kg: number;
  fat_pct: number;
};

const toProfile = (r: Row): Profile => ({
  sex: r.sex,
  birthDate: r.birth_date,
  heightCm: r.height_cm,
  bmrKcal: r.bmr_kcal,
  activityLevel: r.activity_level,
  deficitPct: r.deficit_pct,
  proteinPerKg: r.protein_per_kg,
  fatPct: r.fat_pct,
});

/** プロフィール（1 件のみ。起動時に既定値で作成済み） */
export class ProfileRepository {
  constructor(private db: Db) {}

  get(): Profile {
    return toProfile(this.db.prepare('SELECT * FROM profile WHERE id = 1').get() as Row);
  }

  save(input: ProfileInput): Profile {
    this.db
      .prepare(
        `UPDATE profile SET sex = ?, birth_date = ?, height_cm = ?, bmr_kcal = ?, activity_level = ?,
           deficit_pct = ?, protein_per_kg = ?, fat_pct = ?, updated_at = ? WHERE id = 1`,
      )
      .run(
        input.sex,
        input.birthDate,
        input.heightCm == null ? null : round(input.heightCm, 1),
        input.bmrKcal == null ? null : Math.round(input.bmrKcal),
        input.activityLevel,
        round(input.deficitPct, 1),
        round(input.proteinPerKg, 1),
        round(input.fatPct, 1),
        nowIso(),
      );
    return this.get();
  }
}
