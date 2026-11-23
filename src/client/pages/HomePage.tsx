import { Link } from 'react-router';
import { addDays, diffDays, formatJa, formatShort, today } from '../../shared/date';
import { useDashboard, useStatsDaily } from '../api/hooks';
import { SparseLineChart, WeightChart } from '../components/charts';
import { ExportReminder } from '../components/DataManagement';
import { ErrorNotice, WarningNotice } from '../components/Feedback';
import { GoalProgress } from '../components/GoalProgress';
import { IntakeProgress, withBonus } from '../components/IntakeProgress';
import { BonusNote } from '../components/WorkoutCard';
import type { DailyStat, Dashboard } from '../../shared/types';

const pickLbm = (d: DailyStat) => d.leanBodyMassKg;
const pickFatMass = (d: DailyStat) => d.fatMassKg;

function Delta({ value, unit, label }: { value: number | null; unit: string; label: string }) {
  if (value == null) return <span className="stat-sub muted">{label} —</span>;
  const cls = value < 0 ? 'delta-down' : 'delta-up';
  return (
    <span className={`stat-sub ${cls}`}>
      {label} {value > 0 ? '+' : ''}
      {value.toFixed(1)}
      {unit}
    </span>
  );
}

export function HomePage() {
  const date = today();
  const dash = useDashboard(date);
  const stats = useStatsDaily();
  const d = dash.data;
  const last30 = (stats.data ?? []).filter((x) => x.date >= addDays(date, -29));

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>{formatJa(date)}</h1>
        <span className="spacer" />
        <Link className="button" to={`/record/${date}`}>
          今日の記録へ →
        </Link>
      </div>
      <ErrorNotice error={dash.error ?? stats.error} />
      <ExportReminder />

      {d && (
        <>
          {d.bodyFat.reminder && (
            <WarningNotice>
              {d.bodyFat.daysSince == null
                ? '体脂肪率がまだ記録されていません。'
                : `前回の体脂肪率の測定（${formatShort(d.bodyFat.latestDate!)}）から${d.bodyFat.daysSince}日たちました。測定しましょう。`}
            </WarningNotice>
          )}
          <div className="grid-3">
            <div className="card">
              <div className="stat-label">
                体重{d.weight.latestDate && d.weight.latestDate !== date ? `（${formatShort(d.weight.latestDate)}）` : ''}
              </div>
              <div className="stat-value">
                {d.weight.latest ?? '—'}
                <span className="stat-unit">kg</span>
              </div>
              <Delta value={d.weight.diffFromPrev} unit="kg" label="前回比" />
            </div>
            <div className="card">
              <div className="stat-label">7日平均</div>
              <div className="stat-value">
                {d.weight.ma7 ?? '—'}
                <span className="stat-unit">kg</span>
              </div>
              <Delta value={d.weight.ma7DiffFromLastWeek} unit="kg" label="前週比" />
            </div>
            <div className="card">
              <div className="stat-label">
                体脂肪率{d.bodyFat.latestDate ? `（${formatShort(d.bodyFat.latestDate)} 測定）` : ''}
              </div>
              <div className="stat-value">
                {d.bodyFat.latest ?? '—'}
                <span className="stat-unit">%</span>
              </div>
              {d.bodyFat.leanBodyMassKg != null ? (
                <span className="stat-sub">
                  除脂肪体重 {d.bodyFat.leanBodyMassKg}kg ／ 体脂肪量 {d.bodyFat.fatMassKg}kg
                </span>
              ) : (
                <span className="stat-sub muted">
                  {d.bodyFat.latestDate ? `${diffDays(d.bodyFat.latestDate, date)}日前に測定` : '未測定'}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {d && (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>今日の摂取</h2>
            <span className="small muted">{d.intake.count}品</span>
          </div>
          <IntakeProgress intake={d.intake} goal={withBonus(d.goal, d.bonus)} />
          {d.goal && <BonusNote bonus={d.bonus} />}
          <EnergyBalance dash={d} />
        </div>
      )}

      {d && stats.data && <GoalProgress dash={d} days={stats.data} />}

      <div className="card chart-card">
        <h2>体重（直近30日）</h2>
        <WeightChart days={last30} />
      </div>

      <div className="grid-2">
        <div className="card chart-card">
          <h2>除脂肪体重（全期間）</h2>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            筋肉量の目安。維持・増加していれば順調です
          </p>
          <SparseLineChart
            days={stats.data ?? []}
            pick={pickLbm}
            label="除脂肪体重"
            unit="kg"
            color="series1"
            emptyText="体重と体脂肪率を同じ日に記録すると表示されます"
          />
        </div>
        <div className="card chart-card">
          <h2>体脂肪量（全期間）</h2>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            減っていれば脂肪が落ちています
          </p>
          <SparseLineChart
            days={stats.data ?? []}
            pick={pickFatMass}
            label="体脂肪量"
            unit="kg"
            color="series2"
            emptyText="体重と体脂肪率を同じ日に記録すると表示されます"
          />
        </div>
      </div>
    </div>
  );
}

/** 今日の消費の目安と、摂取との差 */
function EnergyBalance({ dash }: { dash: Dashboard }) {
  const e = dash.energy;
  if (!e) {
    return (
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        <Link to="/settings">目標・設定</Link> で性別・生年月日・身長を入れると、1日の消費の目安と収支が表示されます。
      </p>
    );
  }
  const balance = dash.intake.kcal - e.totalKcal;
  return (
    <div className="energy">
      <div className="energy-row">
        <span className="intake-label">消費（目安）</span>
        <span>
          <strong>{e.totalKcal.toLocaleString()}</strong> kcal
          <span className="small muted">
            {' '}
            ＝ 基礎代謝 {e.bmr.toLocaleString()} × {e.activityLevel}
            {e.workoutKcal > 0 ? ` ＋ 運動 ${e.workoutKcal.toLocaleString()}` : ''}
          </span>
        </span>
      </div>
      <div className="energy-row">
        <span className="intake-label">収支</span>
        <span className={balance > 0 ? 'over-text' : undefined}>
          <strong>
            {balance > 0 ? '+' : ''}
            {balance.toLocaleString()}
          </strong>{' '}
          kcal
          <span className="small muted">{dash.intake.count === 0 ? '（食事の記録なし）' : balance <= 0 ? '（消費が上回っています）' : '（摂取が上回っています）'}</span>
        </span>
      </div>
    </div>
  );
}
