import { Link } from 'react-router';
import { round, weeklyPace } from '../../shared/calc';
import { PACE_GUIDE } from '../../shared/constants';
import { diffDays, formatShort } from '../../shared/date';
import type { DailyStat, Dashboard } from '../../shared/types';
import { signed } from '../utils/num';

const signed2 = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(2)}`;

const PACE_TEXT = {
  fast: { icon: '!', label: '速すぎ', note: '週1%を超えて減っています。筋肉を残すため、目標カロリーを少し上げることを検討してください。' },
  good: { icon: '✓', label: '目安どおり', note: '週0.5〜1%のペースで減っています。' },
  slow: { icon: '→', label: 'ゆっくり', note: 'このペースが2〜3週間続くようなら、目標カロリーの見直しを検討してください。' },
} as const;

/** ホーム：目標体重・体脂肪率までの残りと、最近の減量ペース */
export function GoalProgress({ dash, days }: { dash: Dashboard; days: DailyStat[] }) {
  const goal = dash.goal;
  const pace = weeklyPace(days, 2, PACE_GUIDE);
  // 体重は日々ぶれるので、7日平均があればそちらで比べる
  const weightNow = dash.weight.ma7 ?? dash.weight.latest;
  const weightBasis = dash.weight.ma7 != null ? '7日平均' : '最新';

  const rows: { label: string; value: string; sub?: string; testId: string }[] = [];
  if (goal?.targetWeightKg != null && weightNow != null) {
    const d = round(goal.targetWeightKg - weightNow, 1);
    rows.push({
      label: `目標体重 ${goal.targetWeightKg}kg`,
      value: d === 0 ? '達成しました' : `あと ${signed(d)}kg`,
      sub: `${weightBasis} ${weightNow}kg から`,
      testId: 'goal-weight',
    });
  }
  if (goal?.targetBodyFatPct != null && dash.bodyFat.latest != null) {
    const d = round(goal.targetBodyFatPct - dash.bodyFat.latest, 1);
    rows.push({
      label: `目標体脂肪率 ${goal.targetBodyFatPct}%`,
      value: d === 0 ? '達成しました' : `あと ${signed(d)}pt`,
      sub: `${formatShort(dash.bodyFat.latestDate!)} の ${dash.bodyFat.latest}% から`,
      testId: 'goal-bodyfat',
    });
  }
  if (goal?.targetDate) {
    const left = diffDays(dash.date, goal.targetDate);
    let sub: string | undefined;
    if (left > 0 && goal.targetWeightKg != null && weightNow != null) {
      const need = round(((goal.targetWeightKg - weightNow) / left) * 7, 2);
      if (need !== 0) sub = `達成には体重 週 ${signed2(need)}kg のペースが必要`;
    }
    rows.push({
      label: `目標期日 ${formatShort(goal.targetDate)}`,
      value: left > 0 ? `あと ${left}日` : left === 0 ? '今日' : `${-left}日すぎました`,
      sub,
      testId: 'goal-date',
    });
  }

  return (
    <div className="card stack" aria-labelledby="goal-progress-title">
      <div className="row">
        <h2 id="goal-progress-title" style={{ margin: 0 }}>
          目標と進み具合
        </h2>
        <span className="spacer" />
        <Link to="/settings" className="small">
          目標を変更
        </Link>
      </div>

      {!goal ? (
        <p className="muted" style={{ margin: 0 }}>
          目標がまだありません。<Link to="/settings">目標・設定</Link>で目安を計算して目標を保存すると、ここに残りの量が表示されます。
        </p>
      ) : rows.length > 0 ? (
        <div className="goal-rows">
          {rows.map((r) => (
            <div className="goal-row" key={r.testId} data-testid={r.testId}>
              <span className="stat-label">{r.label}</span>
              <span className="goal-value">{r.value}</span>
              {r.sub && <span className="stat-sub">{r.sub}</span>}
            </div>
          ))}
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          目標体重・目標体脂肪率・目標期日を設定すると、残りの量が表示されます。
        </p>
      )}

      <div className={`pace pace-${pace?.status ?? 'none'}`} data-testid="pace">
        <span className="stat-label">最近2週間の減量ペース（体重の7日平均）</span>
        {pace ? (
          <>
            <span className="pace-value">
              週 {signed2(pace.kgPerWeek)}kg（{signed2(pace.pctPerWeek)}%）
              <span className="pace-badge">
                <span aria-hidden>{PACE_TEXT[pace.status].icon}</span> {PACE_TEXT[pace.status].label}
              </span>
            </span>
            <span className="stat-sub">{PACE_TEXT[pace.status].note}</span>
          </>
        ) : (
          <span className="stat-sub muted">体重を2週間ほど記録すると表示されます（目安：週0.5〜1%減）。</span>
        )}
      </div>
    </div>
  );
}
