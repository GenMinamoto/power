import { addDays } from '../../shared/date';
import type { DailyStat } from '../../shared/types';

export const RANGES = [
  { key: '7d', label: '1週間', days: 7 },
  { key: '30d', label: '1か月', days: 30 },
  { key: '90d', label: '3か月', days: 90 },
  { key: 'all', label: '全期間', days: null },
] as const;
export type RangeKey = (typeof RANGES)[number]['key'];

/** 今日を含む直近 n 日に絞り込む（全期間はそのまま） */
export function filterRange(days: DailyStat[], key: RangeKey, today: string): DailyStat[] {
  const r = RANGES.find((x) => x.key === key)!;
  if (r.days == null) return days;
  const from = addDays(today, -(r.days - 1));
  return days.filter((d) => d.date >= from && d.date <= today);
}

export function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  return (
    <div className="segmented" role="group" aria-label="表示期間">
      {RANGES.map((r) => (
        <button key={r.key} type="button" aria-pressed={value === r.key} onClick={() => onChange(r.key)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
