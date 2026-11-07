// マイグレーション。配列の順番がそのままバージョン番号（PRAGMA user_version）になる。
// 一度リリースした SQL は書き換えず、変更は新しい要素を末尾に追加すること。

export const MIGRATIONS: string[] = [
  // 1: 初期スキーマ
  /* sql */ `
  CREATE TABLE profile (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    sex             TEXT    CHECK (sex IN ('male','female')),
    birth_date      TEXT,
    height_cm       REAL    CHECK (height_cm BETWEEN 100 AND 250),
    bmr_kcal        INTEGER CHECK (bmr_kcal BETWEEN 500 AND 5000),
    activity_level  REAL    NOT NULL DEFAULT 1.55,
    deficit_pct     REAL    NOT NULL DEFAULT 20 CHECK (deficit_pct BETWEEN 0 AND 30),
    protein_per_kg  REAL    NOT NULL DEFAULT 2.0 CHECK (protein_per_kg BETWEEN 1.0 AND 3.0),
    fat_pct         REAL    NOT NULL DEFAULT 20  CHECK (fat_pct BETWEEN 15 AND 40),
    updated_at      TEXT    NOT NULL
  );

  CREATE TABLE body_logs (
    date          TEXT PRIMARY KEY,
    weight_kg     REAL CHECK (weight_kg BETWEEN 20 AND 300),
    body_fat_pct  REAL CHECK (body_fat_pct BETWEEN 2 AND 70),
    memo          TEXT CHECK (length(memo) <= 500),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    CHECK (weight_kg IS NOT NULL OR body_fat_pct IS NOT NULL)
  );

  CREATE TABLE foods (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    serving_note  TEXT CHECK (length(serving_note) <= 100),
    kcal          REAL NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
    protein_g     REAL NOT NULL CHECK (protein_g BETWEEN 0 AND 500),
    fat_g         REAL NOT NULL CHECK (fat_g BETWEEN 0 AND 500),
    carbs_g       REAL NOT NULL CHECK (carbs_g BETWEEN 0 AND 500),
    use_count     INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );
  CREATE INDEX idx_foods_name ON foods(name);

  CREATE TABLE meal_entries (
    id           INTEGER PRIMARY KEY,
    date         TEXT NOT NULL,
    meal_type    TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','other')),
    sort_order   INTEGER NOT NULL DEFAULT 0,
    food_name    TEXT NOT NULL CHECK (length(food_name) BETWEEN 1 AND 100),
    amount_note  TEXT CHECK (length(amount_note) <= 100),
    food_id      INTEGER REFERENCES foods(id) ON DELETE SET NULL,
    multiplier   REAL CHECK (multiplier > 0 AND multiplier <= 20),
    kcal         REAL NOT NULL CHECK (kcal BETWEEN 0 AND 5000),
    protein_g    REAL NOT NULL CHECK (protein_g BETWEEN 0 AND 500),
    fat_g        REAL NOT NULL CHECK (fat_g BETWEEN 0 AND 500),
    carbs_g      REAL NOT NULL CHECK (carbs_g BETWEEN 0 AND 500),
    memo         TEXT CHECK (length(memo) <= 500),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );
  CREATE INDEX idx_meal_entries_date ON meal_entries(date, meal_type, sort_order);

  CREATE TABLE goals (
    id                   INTEGER PRIMARY KEY,
    start_date           TEXT NOT NULL UNIQUE,
    kcal                 INTEGER NOT NULL CHECK (kcal BETWEEN 800 AND 6000),
    protein_g            REAL NOT NULL CHECK (protein_g BETWEEN 0 AND 500),
    fat_g                REAL NOT NULL CHECK (fat_g BETWEEN 0 AND 500),
    carbs_g              REAL NOT NULL CHECK (carbs_g BETWEEN 0 AND 1000),
    target_weight_kg     REAL CHECK (target_weight_kg BETWEEN 20 AND 300),
    target_body_fat_pct  REAL CHECK (target_body_fat_pct BETWEEN 2 AND 70),
    target_date          TEXT,
    created_at           TEXT NOT NULL
  );
  `,
];
