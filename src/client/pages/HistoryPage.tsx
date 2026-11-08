import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { addDays, formatJa, rangeDays, today } from '../../shared/date';
import type { BodyLog, DailyStat } from '../../shared/types';
import { useBodyLogs, useStatsDaily } from '../api/hooks';
import { ErrorNotice } from '../components/Feedback';
import { fmtG } from '../utils/num';

type Tab = 'body' | 'meals';

const fmt1 = (v: number | null) => (v == null ? '—' : v.toFixed(1));

/** その月の 1 日〜末日（今月は今日まで）を新しい順に */
function monthDays(month: string, t: string): string[] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`, -1);
  const end = last < t ? last : t;
  return first > end ? [] : rangeDays(first, end).reverse();
}

/** 今日（今日が未入力なら昨日）から続けて記録している日数 */
function streak(has: (date: string) => boolean, t: string): number {
  let d = has(t) ? t : addDays(t, -1);
  let n = 0;
  while (has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function monthLabel(m: string) {
  return `${m.slice(0, 4)}年${Number(m.slice(5))}月`;
}

export function HistoryPage() {
  const logs = useBodyLogs();
  const stats = useStatsDaily();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const t = today();
  const thisMonth = t.slice(0, 7);
  const tab: Tab = params.get('tab') === 'meals' ? 'meals' : 'body';

  const bodyMap = useMemo(() => new Map((logs.data ?? []).map((l) => [l.date, l])), [logs.data]);
  const statMap = useMemo(() => new Map((stats.data ?? []).map((s) => [s.date, s])), [stats.data]);

  // 最初の記録の月〜今月
  const months = useMemo(() => {
    const first = [stats.data?.[0]?.date, logs.data?.[0]?.date].filter((d): d is string => !!d).sort()[0] ?? t;
    const out: string[] = [];
    for (let m = first.slice(0, 7); m <= thisMonth; ) {
      out.push(m);
      const [y, mm] = m.split('-').map(Number) as [number, number];
      m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
    }
    return out.reverse();
  }, [stats.data, logs.data, t, thisMonth]);

  const paramMonth = params.get('month');
  const month = paramMonth && months.includes(paramMonth) ? paramMonth : thisMonth;
  const days = monthDays(month, t);

  const setParam = (k: string, v: string) =>
    setParams(
      (p) => {
        p.set(k, v);
        return p;
      },
      { replace: true },
    );

  const hasWeight = (d: string) => bodyMap.get(d)?.weightKg != null;
  const hasMeal = (d: string) => (statMap.get(d)?.mealCount ?? 0) > 0;
  const recorded = days.filter(tab === 'body' ? (d) => bodyMap.has(d) : hasMeal).length;
  const run = streak(tab === 'body' ? hasWeight : hasMeal, t);

  const open = (date: string) => navigate(`/record/${date}`);
  const rowProps = (date: string, empty: boolean) => ({
    key: date,
    className: `clickable${empty ? ' empty-day' : ''}`,
    tabIndex: 0,
    onClick: () => open(date),
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Enter' && open(date),
  });

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>履歴</h1>
        <div className="segmented" role="group" aria-label="表示する記録">
          <button type="button" aria-pressed={tab === 'body'} onClick={() => setParam('tab', 'body')}>
            体組成
          </button>
          <button type="button" aria-pressed={tab === 'meals'} onClick={() => setParam('tab', 'meals')}>
            食事
          </button>
        </div>
        <span className="spacer" />
        <select value={month} onChange={(e) => setParam('month', e.target.value)} aria-label="月を選ぶ">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={logs.error ?? stats.error} />

      <div className="card stack">
        <div className="row small secondary history-summary">
          <span>
            {monthLabel(month)}：{tab === 'body' ? '体組成' : '食事'}を記録した日 <strong>{recorded}</strong> / {days.length}日
          </span>
          {month === thisMonth && (
            <span>
              {tab === 'body' ? '体重' : '食事'}の連続記録 <strong>{run}</strong>日
            </span>
          )}
          <span className="muted">行を押すとその日の記録画面を開きます</span>
        </div>

        <div className="table-wrap">
          {tab === 'body' ? (
            <BodyTable days={days} map={bodyMap} rowProps={rowProps} />
          ) : (
            <MealTable days={days} map={statMap} rowProps={rowProps} />
          )}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {tab === 'body'
            ? '単位：体重・除脂肪体重・体脂肪量は kg、体脂肪率は %'
            : '単位：P・F・C は g。目標比はその日の目標カロリーに対する割合'}
        </p>
      </div>
    </div>
  );
}

type RowProps = (date: string, empty: boolean) => Record<string, unknown> & { key: string };

function EmptyCells({ span }: { span: number }) {
  return (
    <td colSpan={span} className="empty-cell">
      未入力
    </td>
  );
}

function BodyTable({ days, map, rowProps }: { days: string[]; map: Map<string, BodyLog>; rowProps: RowProps }) {
  return (
    <table className="data history-table">
      <thead>
        <tr>
          <th>日付</th>
          <th>体重</th>
          <th>体脂肪率</th>
          <th title="除脂肪体重">除脂肪</th>
          <th>体脂肪量</th>
          <th className="memo-cell" style={{ textAlign: 'left' }}>
            メモ
          </th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const l = map.get(d);
          const { key, ...rest } = rowProps(d, !l);
          return (
            <tr key={key} {...rest}>
              <td>{formatJa(d)}</td>
              {l ? (
                <>
                  <td>{fmt1(l.weightKg)}</td>
                  <td>{fmt1(l.bodyFatPct)}</td>
                  <td>{fmt1(l.leanBodyMassKg)}</td>
                  <td>{fmt1(l.fatMassKg)}</td>
                  <td style={{ textAlign: 'left' }} className="secondary memo-cell">
                    {l.memo ?? ''}
                  </td>
                </>
              ) : (
                <EmptyCells span={5} />
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MealTable({ days, map, rowProps }: { days: string[]; map: Map<string, DailyStat>; rowProps: RowProps }) {
  return (
    <table className="data history-table">
      <thead>
        <tr>
          <th>日付</th>
          <th>品数</th>
          <th>kcal</th>
          <th title="その日の目標カロリーに対する割合">目標比</th>
          <th>P</th>
          <th>F</th>
          <th>C</th>
        </tr>
      </thead>
      <tbody>
        {days.map((d) => {
          const s = map.get(d);
          const has = s != null && s.mealCount > 0;
          const pct = has && s.goalKcal ? Math.round((s.kcal! / s.goalKcal) * 100) : null;
          const { key, ...rest } = rowProps(d, !has);
          return (
            <tr key={key} {...rest}>
              <td>{formatJa(d)}</td>
              {has ? (
                <>
                  <td>{s.mealCount}</td>
                  <td>{s.kcal!.toLocaleString()}</td>
                  <td className={pct != null && pct > 100 ? 'over-text' : undefined}>{pct == null ? '—' : `${pct}%`}</td>
                  <td>{fmtG(s.proteinG!)}</td>
                  <td>{fmtG(s.fatG!)}</td>
                  <td>{fmtG(s.carbsG!)}</td>
                </>
              ) : (
                <EmptyCells span={6} />
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
