import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatJa, today } from '../../shared/date';
import { useBodyLogs } from '../api/hooks';
import { ErrorNotice } from '../components/Feedback';

const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(1));

export function HistoryPage() {
  const logs = useBodyLogs();
  const navigate = useNavigate();
  const months = useMemo(() => {
    const set = new Set((logs.data ?? []).map((l) => l.date.slice(0, 7)));
    set.add(today().slice(0, 7));
    return [...set].sort().reverse();
  }, [logs.data]);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const rows = (logs.data ?? []).filter((l) => l.date.startsWith(month)).reverse();

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ margin: 0 }}>履歴（体組成）</h1>
        <span className="spacer" />
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="月を選ぶ">
          {months.map((m) => (
            <option key={m} value={m}>
              {m.replace('-', '年')}月
            </option>
          ))}
        </select>
      </div>
      <ErrorNotice error={logs.error} />
      <div className="card table-wrap">
        {rows.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            この月の記録はありません。
          </p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>日付</th>
                <th>体重 (kg)</th>
                <th>体脂肪率 (%)</th>
                <th>除脂肪体重 (kg)</th>
                <th>体脂肪量 (kg)</th>
                <th style={{ textAlign: 'left' }}>メモ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr
                  key={l.date}
                  className="clickable"
                  tabIndex={0}
                  onClick={() => navigate(`/record/${l.date}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/record/${l.date}`)}
                >
                  <td>{formatJa(l.date)}</td>
                  <td>{fmt(l.weightKg)}</td>
                  <td>{fmt(l.bodyFatPct)}</td>
                  <td>{fmt(l.leanBodyMassKg)}</td>
                  <td>{fmt(l.fatMassKg)}</td>
                  <td style={{ textAlign: 'left' }} className="secondary">
                    {l.memo ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
