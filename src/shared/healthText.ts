import { WORKOUT_KINDS, WORKOUT_LABELS, type WorkoutKind } from './constants.js';
import { isValidDate } from './date.js';
import type { HealthWorkoutInput } from './schemas.js';

// iPhone の「ショートカット」がコピーする文字を読み取る。
// 1 行に 1 件。行は「power」で始まり、「名前=値」をスペース（または & ;）で区切る。
//   例：power date=2026-11-23 kind=run kcal=352.4 km=5.2 min=31.5
// - date：省略すると今日。2026/11/23 の形でもよい
// - kind：run / walk / strength / cycle / other（省略すると run）
// - kcal：必須。「352.4 kcal」「1,234」のように単位や桁区切りが付いていてもよい
// - km・min：任意。0 なら「なし」
// - name：任意（省略すると「ランニング（ヘルスケア）」など）

/** ショートカットの名前（Power のボタンから、この名前のショートカットを実行する） */
export const SHORTCUT_NAME = 'Power取り込み';

export type HealthParseResult = {
  items: HealthWorkoutInput[];
  /** 運動がなかった（kcal が 0）行の日付 */
  empty: string[];
  errors: string[];
};

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const m = /-?\d+(?:\.\d+)?/.exec(v.replaceAll(',', ''));
  return m ? Number(m[0]) : null;
}

export function parseHealthText(text: string, defaultDate: string): HealthParseResult {
  const res: HealthParseResult = { items: [], empty: [], errors: [] };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^power\b/i.test(l));
  if (lines.length === 0) {
    res.errors.push('Power 用の内容が見つかりません。ショートカットを実行してから、もう一度お試しください。');
    return res;
  }
  lines.forEach((line, i) => {
    const kv: Record<string, string> = {};
    for (const tok of line.replace(/^power[^\s&;]*/i, '').split(/[\s&;]+/)) {
      const eq = tok.indexOf('=');
      if (eq > 0) kv[tok.slice(0, eq).toLowerCase()] = tok.slice(eq + 1);
    }
    const label = lines.length > 1 ? `${i + 1}行目：` : '';

    const date = kv.date ? kv.date.replaceAll('/', '-').replace(/-(\d)(?!\d)/g, '-0$1') : defaultDate;
    if (!isValidDate(date)) {
      res.errors.push(`${label}日付「${kv.date}」を読み取れません`);
      return;
    }
    const kind = (kv.kind ?? 'run').toLowerCase() as WorkoutKind;
    if (!WORKOUT_KINDS.includes(kind)) {
      res.errors.push(`${label}種目「${kv.kind}」を読み取れません（run / walk / strength / cycle / other）`);
      return;
    }
    const kcal = num(kv.kcal);
    if (kcal == null || kcal < 0) {
      res.errors.push(`${label}消費カロリー（kcal=）がありません`);
      return;
    }
    if (Math.round(kcal) === 0) {
      res.empty.push(date);
      return;
    }
    const km = num(kv.km);
    const min = num(kv.min);
    res.items.push({
      date,
      kind,
      name: kv.name ? decodeURIComponent(kv.name) : `${WORKOUT_LABELS[kind]}（ヘルスケア）`,
      durationMin: min != null && min >= 1 ? min : null,
      distanceKm: km != null && km > 0 ? km : null,
      kcal,
    });
  });
  return res;
}
