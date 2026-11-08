import { weeklySummary } from '../../shared/calc';
import { addDays, formatShort, today, weekStart } from '../../shared/date';
import type { DailyStat } from '../../shared/types';
import { fmtG, signed } from '../utils/num';

const dash = <span className="muted">—</span>;
const g = (v: number | null) => (v == null ? dash : fmtG(v));

/**
 * 週ごとの平均（新しい週が上）。days は全期間の日別データ。
 * from を含む週から表示する（期間の途中から始まる週も、その週 7 日分で計算する）。
 */
export function WeeklySummary({ days, from }: { days: DailyStat[]; from: string | null }) {
  const start = from ? weekStart(from) : '';
  const weeks = weeklySummary(days).filter(
    (w) => w.weekStart >= start && (w.weightDays > 0 || w.mealDays > 0 || w.avgBodyFatPct != null),
  );
  const thisWeek = weekStart(today());

  if (weeks.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        この期間の記録はまだありません。
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data weekly-table">
        <thead>
          <tr>
            <th>週（月〜日）</th>
            <th>平均体重</th>
            <th>前週比</th>
            <th>体脂肪率</th>
            <th>平均 kcal</th>
            <th>P</th>
            <th>F</th>
            <th>C</th>
            <th title="体重・食事を記録した日数">記録日数</th>
          </tr>
        </thead>
        <tbody>
          {[...weeks].reverse().map((w) => (
            <tr key={w.weekStart}>
              <td>
                {formatShort(w.weekStart)}〜{formatShort(addDays(w.weekStart, 6))}
                {w.weekStart === thisWeek && <span className="small muted">（今週）</span>}
              </td>
              <td>{w.avgWeightKg == null ? dash : `${w.avgWeightKg.toFixed(1)}kg`}</td>
              <td className={w.diffWeightKg != null && w.diffWeightKg < 0 ? 'delta-down' : undefined}>
                {w.diffWeightKg == null ? dash : signed(w.diffWeightKg)}
              </td>
              <td>{w.avgBodyFatPct == null ? dash : `${w.avgBodyFatPct.toFixed(1)}%`}</td>
              <td>{w.avgKcal == null ? dash : w.avgKcal.toLocaleString()}</td>
              <td>{g(w.avgProteinG)}</td>
              <td>{g(w.avgFatG)}</td>
              <td>{g(w.avgCarbsG)}</td>
              <td className="secondary small">
                体重 {w.weightDays}・食事 {w.mealDays}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        平均は記録のある日だけで計算しています。P・F・C は g。前週比は平均体重の差（kg）です。
      </p>
    </div>
  );
}
