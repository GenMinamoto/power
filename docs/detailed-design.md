# 詳細設計書：ボディメイク記録アプリ（仮称：Power）

| 項目 | 内容 |
|---|---|
| 版 | 0.1 |
| 作成日 | 2026-11-08 |
| 前提 | [要件定義書](requirements.md) 版0.2 ／ [基本設計書](basic-design.md) 版0.1 |

詳細設計では、実装に必要なファイル構成・テーブル定義・APIの入出力・関数仕様・画面項目・処理手順を定める。

---

## 1. ディレクトリ・モジュール構成

```
power/
├─ docs/
├─ data/                         ← 実データ（.gitignore）
│   ├─ power.db
│   └─ backups/power-YYYYMMDD.db
├─ src/
│   ├─ shared/                   画面・サーバー共通
│   │   ├─ types.ts              エンティティ・APIの型
│   │   ├─ schemas.ts            Zod スキーマ（入力チェック）
│   │   ├─ calc.ts               計算関数（§5）
│   │   ├─ date.ts               日付関数（§5.3）
│   │   └─ constants.ts          区分名・活動係数・入力範囲など
│   ├─ server/
│   │   ├─ index.ts              起動、Fastify 生成、静的配信、ブラウザ起動
│   │   ├─ app.ts                buildApp(db) … テストからも使う
│   │   ├─ db.ts                 openDb(path) / migrate(db)
│   │   ├─ migrations/001_init.sql
│   │   ├─ repositories/         bodyLogs.ts / meals.ts / foods.ts / goals.ts / profile.ts / stats.ts
│   │   ├─ routes/               bodyLogs.ts / meals.ts / foods.ts / goals.ts / profile.ts / stats.ts / data.ts
│   │   ├─ backup.ts             自動バックアップ・世代管理
│   │   └─ errors.ts             エラー型・エラーハンドラ
│   └─ client/
│       ├─ main.tsx / App.tsx    ルーティング・レイアウト
│       ├─ api/client.ts         fetch ラッパー
│       ├─ api/hooks.ts          TanStack Query フック（§6.1）
│       ├─ pages/                HomePage / RecordPage / ChartsPage / HistoryPage / FoodsPage / SettingsPage
│       ├─ components/           §6.2
│       └─ styles/               tokens.css（色・余白）/ app.css
├─ tests/
│   ├─ calc.test.ts / date.test.ts
│   └─ api/*.test.ts
├─ start.bat
├─ package.json / tsconfig.json / vite.config.ts / vitest.config.ts
└─ README.md
```

**依存の向き**：`client → shared`、`server → shared`。`shared` は他に依存しない（Node・ブラウザ両方で動くこと）。

### 1.1 npm スクリプト

| スクリプト | 内容 |
|---|---|
| `dev` | サーバー（tsx watch, :3000）と Vite（:5173, `/api` を :3000 に中継）を同時起動 |
| `build` | `vite build`（→ `dist/client`）＋ サーバーを `tsc`（→ `dist/server`） |
| `start` | `node dist/server/index.js`（起動後にブラウザで `http://localhost:3000` を開く） |
| `test` | `vitest run` |
| `typecheck` | `tsc --noEmit` |

`start.bat`：`dist/` が無ければ `npm run build` を実行してから `npm start`。

---

## 2. 共通仕様

| 項目 | 仕様 |
|---|---|
| 日付 | ローカル日付文字列 `YYYY-MM-DD`。`new Date().toISOString()` で日付を作らない（UTC ずれ防止） |
| 日時 | `created_at` / `updated_at` は ISO 8601（`2026-11-08T08:01:23.456+09:00`） |
| 丸め（保存時） | 体重・体脂肪率：小数1桁／kcal：整数／PFC：小数1桁／倍率：小数2桁 |
| 丸め（表示） | 合計 kcal は整数、PFC 合計は整数表示（ツールチップは小数1桁） |
| 命名 | DB・API の JSON は snake_case ではなく **API は camelCase**、DB は snake_case。repository で変換 |
| 文字コード | UTF-8 |

### 2.1 定数（`constants.ts`）

```ts
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'other'] as const;
export const MEAL_LABELS = { breakfast: '朝食', lunch: '昼食', dinner: '夕食', other: 'その他' };

export const ACTIVITY_LEVELS = [
  { value: 1.2,   label: 'ほぼ運動しない（デスクワーク中心）' },
  { value: 1.375, label: '軽い運動（週1〜3回）' },
  { value: 1.55,  label: '中程度の運動（週3〜5回）' },
  { value: 1.725, label: '激しい運動（週6〜7回）' },
  { value: 1.9,   label: '非常に激しい（肉体労働＋毎日のトレーニング）' },
];
export const DEFICIT_OPTIONS = [
  { value: 0,  label: '維持（0%）' },
  { value: 10, label: 'ゆるやか（−10%）' },
  { value: 20, label: '標準（−20%）' },
];
export const DEFAULTS = { activityLevel: 1.55, deficitPct: 20, proteinPerKg: 2.0, fatPct: 20 };
export const BODY_FAT_REMINDER_DAYS = 14;
export const MA_WINDOW = 7, MA_MIN_POINTS = 4;
export const BACKUP_KEEP = 30;
```

---

## 3. データベース詳細

### 3.1 接続・初期化（`db.ts`）

1. `data/` と `data/backups/` が無ければ作成。
2. `new DatabaseSync('data/power.db')` で開く。
3. `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;`
4. `migrate(db)`：`PRAGMA user_version` を読み、`migrations/NNN_*.sql` のうち番号が大きいものを順にトランザクション内で実行し、`user_version` を更新。
5. `profile` に行が無ければ既定値で1行作成。

テスト時は `openDb(':memory:')` を使う。

### 3.2 テーブル定義（`001_init.sql`）

```sql
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
```

### 3.3 主要SQL

| 用途 | SQL |
|---|---|
| ある日の目標 | `SELECT * FROM goals WHERE start_date <= ? ORDER BY start_date DESC LIMIT 1` |
| 期間の目標 | 期間開始日時点の目標＋期間内に開始する目標を取得し、日ごとに適用（§4.6） |
| 1日の食事 | `SELECT * FROM meal_entries WHERE date = ? ORDER BY CASE meal_type WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 WHEN 'dinner' THEN 2 ELSE 3 END, sort_order, id` |
| 日別合計 | `SELECT date, SUM(kcal), SUM(protein_g), SUM(fat_g), SUM(carbs_g), COUNT(*) FROM meal_entries WHERE date BETWEEN ? AND ? GROUP BY date` |
| 最新の体脂肪率 | `SELECT date, body_fat_pct, weight_kg FROM body_logs WHERE body_fat_pct IS NOT NULL ORDER BY date DESC LIMIT 2`（最新と前回） |
| 食品検索 | `SELECT * FROM foods WHERE name LIKE '%' \|\| ? \|\| '%' ORDER BY use_count DESC, name LIMIT 20` |
| 新規行の並び順 | `SELECT COALESCE(MAX(sort_order), -1) + 1 FROM meal_entries WHERE date = ? AND meal_type = ?` |

---

## 4. API 詳細

### 4.0 共通

- ベースパス `/api`、`Content-Type: application/json`、JSON は camelCase。
- 入力は `schemas.ts` の Zod スキーマで検証。
- エラー応答の形式：

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "入力内容を確認してください", "details": [{ "path": "weightKg", "message": "20〜300の範囲で入力してください" }] } }
```

| HTTP | code | 発生条件 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 入力チェック違反 |
| 404 | `NOT_FOUND` | 対象なし |
| 409 | `CONFLICT` | 一意制約違反など |
| 500 | `INTERNAL_ERROR` | 想定外（サーバーログに詳細を出す） |

### 4.1 体組成

**GET `/api/body-logs?from=YYYY-MM-DD&to=YYYY-MM-DD`**（省略時は全期間）

```json
[{ "date": "2026-11-08", "weightKg": 74.8, "bodyFatPct": 18.2, "memo": null,
   "leanBodyMassKg": 61.2, "fatMassKg": 13.6 }]
```
`leanBodyMassKg` / `fatMassKg` は両方の値がある日のみ、それ以外は `null`。日付昇順。

**GET `/api/body-logs/:date`** → `{ log, previousBodyFat, previousWeight }`（常に 200）。`log` はその日の記録（無ければ `null`）、`previousBodyFat` はその日より前の最新の体脂肪率測定 `{date, weightKg, bodyFatPct, leanBodyMassKg, fatMassKg}`、`previousWeight` はその日より前の最新の体重 `{date, weightKg}`。記録画面は未入力の日も前回値を表示するため、404 にはしない。

**PUT `/api/body-logs/:date`**（upsert）

| 項目 | 型 | 必須 | チェック |
|---|---|---|---|
| weightKg | number \| null | △ | 20〜300、小数1桁に丸め |
| bodyFatPct | number \| null | △ | 2〜70、小数1桁に丸め |
| memo | string \| null | — | 500文字以内 |

△：どちらか一方は必須。応答は GET と同じ形。

**DELETE `/api/body-logs/:date`** → 204

### 4.2 食事

**GET `/api/meals?date=YYYY-MM-DD`**

```json
{
  "date": "2026-11-08",
  "entries": [{ "id": 12, "mealType": "breakfast", "sortOrder": 0, "foodName": "オートミール",
                "amountNote": "40g", "foodId": 3, "multiplier": 1.0,
                "kcal": 150, "proteinG": 5.4, "fatG": 2.3, "carbsG": 27.6, "memo": null }],
  "subtotals": { "breakfast": { "kcal": 520, "proteinG": 38.0, "fatG": 12.0, "carbsG": 62.0 }, "lunch": {…}, "dinner": {…}, "other": {…} },
  "total": { "kcal": 1520, "proteinG": 112.0, "fatG": 31.0, "carbsG": 180.0 },
  "goal": { "kcal": 2106, "proteinG": 150, "fatG": 47, "carbsG": 271 }
}
```
`goal` は目標未設定なら `null`。

**POST `/api/meals`**

| 項目 | 型 | 必須 | チェック・処理 |
|---|---|---|---|
| date | string | ○ | `YYYY-MM-DD` |
| mealType | enum | ○ | breakfast / lunch / dinner / other |
| foodName | string | ○ | 1〜100文字 |
| amountNote | string \| null | — | 100文字以内 |
| foodId | number \| null | — | 存在する食品。あれば `foods.use_count += 1` |
| multiplier | number \| null | — | 0 < x ≦ 20 |
| kcal | number \| null | — | 0〜5000。**null の場合 `kcalFromPfc` で計算して保存** |
| proteinG / fatG / carbsG | number | ○ | 0〜500 |
| memo | string \| null | — | 500文字以内 |

`sortOrder` はサーバーが末尾に採番。応答は作成した1件（201）。

**PUT `/api/meals/:id`**：POST と同じ項目（`date`, `mealType` の変更も可）。`foodId` の use_count は変更しない。

**DELETE `/api/meals/:id`** → 204

**POST `/api/meals/copy`**

| 項目 | 型 | 必須 | 内容 |
|---|---|---|---|
| fromDate | string | ○ | コピー元 |
| toDate | string | ○ | コピー先（fromDate と異なること） |
| mealType | enum \| null | — | 指定時はその区分のみ。null で全区分 |

処理：コピー元の行を、コピー先の各区分の末尾に追加（既存行は残す）。1トランザクション。応答 `{ "copied": 5 }`。コピー元が0件なら 404。

### 4.3 マイ食品

| API | 入出力 |
|---|---|
| GET `/api/foods?q=` | `q` 省略時は全件（use_count 降順→名前順）。`q` ありは部分一致・最大20件 |
| POST `/api/foods` | `{ name, servingNote, kcal, proteinG, fatG, carbsG }`。kcal 省略時は PFC から計算。201 |
| PUT `/api/foods/:id` | 同上。過去の meal_entries は変更しない |
| DELETE `/api/foods/:id` | 204。meal_entries.food_id は NULL になる（記録は残る） |

### 4.4 プロフィール

**GET / PUT `/api/profile`**

```json
{ "sex": "male", "birthDate": "1996-04-01", "heightCm": 175, "bmrKcal": null,
  "activityLevel": 1.55, "deficitPct": 20, "proteinPerKg": 2.0, "fatPct": 20 }
```
PUT は全項目を受け取り上書き（未設定項目は null 可。ただし activityLevel 等は既定値あり）。

### 4.5 目標

| API | 内容 |
|---|---|
| GET `/api/goals` | 開始日の降順で全件 |
| GET `/api/goals/effective?date=` | その日に適用される目標。無ければ `null`（200） |
| POST `/api/goals` | `{ startDate, kcal, proteinG, fatG, carbsG, targetWeightKg?, targetBodyFatPct?, targetDate? }`。同じ startDate があれば上書き（upsert）。201 |
| DELETE `/api/goals/:id` | 204 |

### 4.6 集計

**GET `/api/dashboard?date=`**

```json
{
  "date": "2026-11-08",
  "weight": { "latest": 74.8, "latestDate": "2026-11-08", "diffFromPrev": -0.2,
              "ma7": 75.1, "ma7DiffFromLastWeek": -0.4 },
  "bodyFat": { "latest": 18.2, "latestDate": "2026-10-27", "daysSince": 12, "reminder": false,
               "leanBodyMassKg": 61.2, "fatMassKg": 13.6 },
  "intake": { "kcal": 1520, "proteinG": 112, "fatG": 31, "carbsG": 180, "count": 9 },
  "goal": { "id": 1, "startDate": "2026-11-08", "kcal": 2106, "proteinG": 150, "fatG": 47, "carbsG": 271,
            "targetWeightKg": 70, "targetBodyFatPct": 12, "targetDate": "2027-03-31" }
}
```
`reminder` は `daysSince >= 14` または一度も測定なしで `true`。

**GET `/api/stats/daily?from=&to=`**（省略時は全期間。from〜to の全日を返す。記録の無い日も行を作り値は null）

```json
[{ "date": "2026-11-08", "weightKg": 74.8, "weightMa7": 75.1, "bodyFatPct": null,
   "leanBodyMassKg": null, "fatMassKg": null,
   "kcal": 1520, "proteinG": 112, "fatG": 31, "carbsG": 180, "mealCount": 9,
   "goalKcal": 2106, "goalProteinG": 150, "goalFatG": 47, "goalCarbsG": 271 }]
```
- 7日平均は **from の6日前から** の体重を読み込んで計算する（期間の先頭でも正しく出すため）。
- 食事が0件の日は kcal 等を null（0と区別）。

**GET `/api/stats/weekly?from=&to=`**：月曜始まりの週ごとに `{ weekStart, avgWeightKg, avgBodyFatPct, avgKcal, avgProteinG, avgFatG, avgCarbsG, recordedDays, diffWeightKg }`。平均は記録のある日だけで計算。`diffWeightKg` は前週の平均体重との差。

### 4.7 データ管理

**GET `/api/export`** → `Content-Disposition: attachment; filename="power-export-YYYYMMDD.json"`

```json
{ "app": "power", "version": 1, "exportedAt": "…",
  "profile": {…}, "bodyLogs": [ … ], "foods": [ … ], "mealEntries": [ … ], "goals": [ … ] }
```
（id・作成日時も含め、そのまま復元できる形）

**POST `/api/import`**（本文はエクスポートと同じ JSON、最大 20MB）
1. `app === "power"` かつ対応 `version` か確認。各配列を Zod で検証（1件でも不正なら 400、何も変更しない）。
2. `createBackup('pre-import')` を実行。
3. トランザクション開始 → 全テーブル DELETE → 全件 INSERT（id 維持）→ コミット。失敗時はロールバック。
4. 応答 `{ "imported": { "bodyLogs": n, "foods": n, "mealEntries": n, "goals": n }, "backupFile": "…" }`

**GET `/api/backups`** → `[{ "file": "power-20261108.db", "createdAt": "…", "sizeBytes": 123456 }]`（新しい順）
**POST `/api/backups`** → 今すぐ作成（同日のファイルがあれば `power-20261108-2.db` のように連番）。201。

---

## 5. 計算・ユーティリティ関数（`src/shared`）

### 5.1 `calc.ts`

```ts
round(n: number, digits: number): number

leanBodyMass(weightKg: number, bodyFatPct: number): number   // round(w*(1-bf/100), 1)
fatMass(weightKg: number, bodyFatPct: number): number        // round(w*bf/100, 1)

kcalFromPfc(p: number, f: number, c: number): number         // Math.round(p*4 + f*9 + c*4)
kcalMismatch(kcal: number, p: number, f: number, c: number): boolean
  // const calc = kcalFromPfc(p,f,c); const d = Math.abs(kcal - calc);
  // return d > 20 && d > Math.max(kcal, calc) * 0.15;

applyMultiplier(food: Nutrients, m: number): Nutrients
  // kcal: Math.round(food.kcal*m), P/F/C: round(x*m, 1)

sumNutrients(items: Nutrients[]): Nutrients                  // 合計（PFC は round 1）

movingAverage(points: { date: string; value: number | null }[],
              window = 7, minPoints = 4): { date: string; value: number | null }[]
  // points は日付連続（欠損日は value=null）であること。
  // 各日について、その日を含む直近 window 日の非 null 値が minPoints 以上なら平均（round 1）、未満なら null。

bmrMifflin(sex: 'male'|'female', weightKg: number, heightCm: number, age: number): number
  // 10*w + 6.25*h - 5*age + (male ? 5 : -161)、Math.round

targetPlan(input: PlanInput): PlanResult
```

**`targetPlan` の詳細**

```ts
type PlanInput = {
  sex: 'male'|'female' | null; age: number | null; heightCm: number | null; weightKg: number;
  bmrKcal: number | null; activityLevel: number; deficitPct: number;
  proteinPerKg: number; fatPct: number;
};
type PlanResult = {
  bmr: number; bmrSource: 'input' | 'mifflin';
  tdee: number; targetKcal: number;
  proteinG: number; fatG: number; carbsG: number;
  warnings: ('BELOW_BMR' | 'CARBS_NEGATIVE' | 'MISSING_PROFILE')[];
};
```

1. `bmrKcal` があれば採用（`bmrSource='input'`）。無ければ sex・age・heightCm が揃っていれば `bmrMifflin`。揃わなければ `MISSING_PROFILE` を返して計算しない。
2. `tdee = Math.round(bmr * activityLevel)`
3. `targetKcal = Math.round(tdee * (1 - deficitPct/100))`
4. `proteinG = Math.round(weightKg * proteinPerKg)`
5. `fatG = Math.round(targetKcal * fatPct/100 / 9)`
6. `carbsG = Math.round((targetKcal - proteinG*4 - fatG*9) / 4)`
7. `targetKcal < bmr` → `BELOW_BMR`、`carbsG < 0` → `CARBS_NEGATIVE`（carbsG は 0 にする）

**検証用の計算例**（単体テストに含める）

| 入力 | 結果 |
|---|---|
| 男性・30歳・175cm・75kg・BMR空欄・1.55・−20%・2.0g/kg・脂質20% | BMR 1,699 → TDEE 2,633 → 2,106kcal、P150・F47・C271 |
| 上記で BMR=1,800 入力 | BMR 1,800 → TDEE 2,790 → 2,232kcal、P150・F50・C296 |

### 5.2 警告・お知らせの判定

| 判定 | 条件 | 表示 |
|---|---|---|
| 体重の急変 | 前回の体重との差が ±3kg 以上 | 保存前に確認「前回より x kg 変化しています。保存しますか？」 |
| 1品の kcal が大きい | 1,500 kcal 超 | 保存前に確認 |
| kcal と PFC のずれ | `kcalMismatch` が true | 行に注意アイコン（保存は可） |
| 体脂肪率お知らせ | 最終測定から 14 日以上、または未測定 | ホームと記録画面に表示 |
| 目標が BMR 未満 | `BELOW_BMR` | 目安計算の結果欄に警告 |

### 5.3 `date.ts`

```ts
today(): string                         // ローカル日付 YYYY-MM-DD
addDays(date: string, n: number): string
diffDays(a: string, b: string): number  // b - a（日数）
rangeDays(from: string, to: string): string[]
weekStart(date: string): string         // その週の月曜
ageOn(birthDate: string, date: string): number
formatJa(date: string): string          // "11/8 (日)"
```
内部では `new Date(y, m-1, d)`（ローカル時刻）で計算し、文字列化も年月日を個別に取り出して行う。

---

## 6. 画面詳細

### 6.1 データ取得（TanStack Query）

| クエリキー | API | 無効化（再取得）のタイミング |
|---|---|---|
| `['bodyLog', date]` | GET body-logs/:date | 体組成の保存・削除 |
| `['meals', date]` | GET meals?date | 食事の追加・更新・削除・コピー、目標保存 |
| `['foods', q]` | GET foods?q | 食品の登録・更新・削除、食事追加（use_count） |
| `['dashboard', date]` | GET dashboard | 体組成・食事・目標の変更 |
| `['statsDaily']` | GET stats/daily（全期間） | 体組成・食事・目標の変更 |
| `['statsWeekly']` | GET stats/weekly | 同上 |
| `['profile']` / `['goals']` | GET profile / goals | それぞれの保存 |

- `staleTime: 30秒`。グラフは全期間を1回取得し、期間切替は画面側で絞り込む。
- 食事の追加・削除は **楽観的更新**（サーバー応答を待たずに一覧へ反映し、失敗時に戻す）で体感速度を上げる。

### 6.2 コンポーネント構成

```
App
├─ Layout（SideNav / BottomTabBar, ErrorBanner, Toast）
├─ HomePage
│   ├─ StatCard ×3（体重 / 7日平均 / 体脂肪率＋お知らせ）
│   ├─ IntakeProgress（kcal・P・F・C の ProgressBar）
│   ├─ WeightChart（直近30日）
│   └─ SparseLineChart ×2（除脂肪体重 / 体脂肪量、全期間）
├─ RecordPage
│   ├─ DateNavigator（◀ 日付 ▶、日付ピッカー）
│   ├─ CopyMealsMenu
│   ├─ BodyLogForm
│   ├─ MealSection ×4
│   │   ├─ MealEntryRow（表示 / 編集モード）
│   │   └─ MealEntryInput（FoodAutocomplete, 倍率, kcal, P, F, C, 追加）
│   └─ DailyTotalBar
├─ ChartsPage
│   ├─ RangeSelector（1週間 / 1か月 / 3か月 / 全期間）
│   ├─ WeightChart / SparseLineChart（体脂肪率・除脂肪体重・体脂肪量）/ KcalChart / PfcChart
│   └─ WeeklySummaryTable
├─ HistoryPage（BodyLogTable / MealHistoryTable, MonthSelector）
├─ FoodsPage（FoodSearch, FoodTable, FoodForm）
└─ SettingsPage（ProfileForm, PlanCalculator, GoalForm, GoalHistory, DataManagement）
```

### 6.3 ② 記録画面の項目定義

**体組成フォーム**

| 項目 | 入力 | 初期値 | チェック | 備考 |
|---|---|---|---|---|
| 体重 | 数値（step 0.1） | その日の記録 | 20〜300 | 画面を開いたらここにフォーカス |
| 体脂肪率 | 数値（step 0.1） | その日の記録 | 2〜70 | 横に「前回 18.2%（10/27）」を表示 |
| メモ | テキスト | — | 500文字 | 折りたたみ |
| 保存 | ボタン / Enter | — | 体重・体脂肪率の両方空なら保存不可 | 保存後に除脂肪体重等と前回比を表示 |

**食事入力行（MealEntryInput）**

| 項目 | 入力 | 動作 |
|---|---|---|
| 食品名 | テキスト＋候補 | 1文字以上で `GET /api/foods?q=` を 150ms 遅延で呼び候補表示（↑↓で選択、Enterで確定）。確定で foodId をセットし kcal・PFC を自動入力 |
| 量メモ | テキスト | 食品選択時は食品の基準量を初期値に |
| 倍率 | 数値（step 0.1、初期1.0） | foodId があるときのみ有効。変更で `applyMultiplier` により即再計算 |
| kcal | 数値 | 空欄のまま追加すると PFC から計算 |
| P / F / C | 数値（step 0.1） | 必須（0 可） |
| 追加 | ボタン / Enter | 追加後、食品名欄をクリアしてフォーカスを戻す（連続入力用） |

- 食品選択後に kcal・PFC を手で書き換えた場合は foodId を外し「手入力」扱いにする（倍率は無効化）。
- 既存行の「☆」で、その行の値（倍率で割り戻した1倍の値）をマイ食品に登録するダイアログを開く。

**区分ごとの小計・1日合計**：`subtotals` / `total` を表示。目標があれば「摂取 / 目標」と達成率。超過は色を変える（kcal 超過は警告色、P 未達は注意色）。

### 6.4 ③ グラフ詳細

| グラフ | X軸 | 系列 | 欠損の扱い |
|---|---|---|---|
| WeightChart | 日付 | 体重（点＋細線）、7日平均（太線）、目標体重（破線・目標設定時のみ） | 体重は欠損を線でつなぐ（`spanGaps: true`）、平均は null を途切れさせる |
| BodyFatChart | 日付 | 体脂肪率 | 測定日の点のみ、点同士を線でつなぐ |
| 除脂肪体重 / 体脂肪量 | 日付 | それぞれ別のグラフ（2つ並べる）。1グラフ1系列 | 測定日の点のみ、線でつなぐ。ツールチップに前回比 |

> 左右2軸のグラフは、軸の取り方しだいで見え方が大きく変わり誤読しやすいため使わない。除脂肪体重（約60kg）と体脂肪量（約13kg）は大きさが違うので、同じ軸に載せると体脂肪量の変化が見えにくくなる。そのため2つのグラフに分ける。
| KcalChart | 日付 | 摂取 kcal（棒）、目標（階段状の線） | 食事0件の日は棒なし |
| PfcChart | 日付 | P×4・F×9・C×4（積み上げ棒、kcal換算） | 同上。上部に期間平均の P:F:C 比率（%） |

- 期間：1週間＝今日を含む7日、1か月＝30日、3か月＝90日、全期間＝最初の記録日〜今日。
- ツールチップは日付・値（単位つき）。ライト/ダークで色を CSS 変数から取得。

### 6.5 ⑥ 目標・設定画面

- **PlanCalculator**：入力が変わるたびに `targetPlan` を即時計算（サーバー通信なし）。体重の初期値は最新の体重記録。プロフィール項目（性別・生年月日・身長・基礎代謝・活動レベル・減量ペース・係数）は変更時にプロフィールとして保存。
- 結果欄に途中経過（BMR と出どころ、TDEE、差し引いた kcal）と警告を表示。
- 「この値を目標に入れる」→ GoalForm に kcal・PFC を流し込む（保存はユーザーが押す）。
- **GoalForm**：適用開始日の初期値は今日。保存で POST /api/goals。
- **DataManagement**：インポートはファイル選択 → 件数を表示して確認ダイアログ「現在のデータはすべて置き換えられます（事前に自動バックアップします）」→ 実行。

---

## 7. サーバー処理詳細

### 7.1 起動処理（`index.ts`）

1. `openDb` → `migrate`
2. `runDailyBackup()`：今日の `power-YYYYMMDD.db` が無ければ作成し、`BACKUP_KEEP` を超える古いファイルを削除。
3. `buildApp(db)`：ルート登録、エラーハンドラ登録、`dist/client` を静的配信（`/api` 以外の未知パスは `index.html` を返す＝画面側ルーティング）。
4. `listen({ host: '127.0.0.1', port: 3000 })`。`EADDRINUSE` の場合「ポート3000が使用中です。すでに起動していませんか？」と表示して終了。
5. 本番起動時は既定ブラウザで `http://localhost:3000` を開く（`start` コマンド）。

### 7.2 バックアップ（`backup.ts`）

- 作成：`VACUUM INTO 'data/backups/<file>'`（使用中でも整合性のあるコピーが取れる）。
- 世代管理：`power-*.db` を名前順に並べ、`BACKUP_KEEP`（30）件を超える古いものを削除。`pre-import` のものは別に直近5件を保持。

### 7.3 トランザクション

複数行を書き換える処理（食事コピー、インポート、use_count 更新を伴う追加）は `BEGIN … COMMIT` で囲み、例外時は `ROLLBACK`。

---

## 8. テスト設計

### 8.1 単体テスト

| 対象 | 主なケース |
|---|---|
| `leanBodyMass` / `fatMass` | 75kg・18% → 61.5 / 13.5 |
| `kcalFromPfc` / `kcalMismatch` | 一致、20kcal 以内のずれ（false）、大きなずれ（true） |
| `applyMultiplier` | 倍率 0.5 / 1.5 / 丸め |
| `movingAverage` | 7日すべてあり、4日あり（値あり）、3日のみ（null）、欠損日を含む |
| `bmrMifflin` / `targetPlan` | §5.1 の計算例2件、BELOW_BMR、CARBS_NEGATIVE、MISSING_PROFILE |
| `date.ts` | 月末・年末の addDays、weekStart（日曜→前の月曜）、ageOn（誕生日前日/当日） |

### 8.2 API テスト（`buildApp(openDb(':memory:'))` ＋ `app.inject`）

| 対象 | 主なケース |
|---|---|
| body-logs | 新規・上書き・片方のみ・両方空で400・範囲外で400・削除・期間取得で除脂肪体重が付く |
| meals | 追加（kcal 省略で自動計算）・更新・削除・小計/合計・目標の付与・コピー（全区分/区分指定/元0件で404） |
| foods | 検索の並び順、削除しても過去の食事が残る、use_count 加算 |
| goals | effective（開始日前は null、境界日、複数目標の切替） |
| stats/daily | 欠損日が null で埋まる、先頭日の7日平均が正しい、日別目標が切り替わる |
| export/import | 書き出し→全削除→読み込みで一致、不正データで400かつ何も変わらない |

### 8.3 画面テスト（E2E、`e2e/*.spec.ts`）

Playwright で PC にインストール済みの Microsoft Edge を自動操作する（`npm run test:e2e`）。サーバーは環境変数 `POWER_DATA_DIR` で一時フォルダを保存先にして起動し、本番の `data/` には触れない。

| 対象 | 主なケース |
|---|---|
| 記録画面 | 体重欄へのフォーカス、Enter で保存、再読み込み後も残る、入力チェック、3kg 以上の変化の確認ダイアログ、削除、除脂肪体重と前回測定からの変化、前後の日への移動、不正な日付の URL |
| ホーム | 記録なしの表示、最新値・前回比・7日平均、体脂肪率のお知らせ |
| グラフ | 期間切り替え、空表示、選んだ期間の保持 |
| 履歴・設定 | 月の切り替え、行クリックで記録画面へ、手動バックアップ |
| 表示 | スマホ幅（390px）で横にはみ出さない、ダークモード、コンソールエラーが出ない |

### 8.4 手動確認（各フェーズ完了時）

- 入力 → 保存 → サーバー再起動 → データが残っている
- `data/backups/` にその日のファイルができている
- グラフの期間切替、スマホ幅（DevTools）での表示
- キーボードだけで1日分（体重＋食事3品）を入力できる
