import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { addDays, formatJaLong, isValidDate, today } from '../../shared/date';
import { useBodyLog } from '../api/hooks';
import { BodyLogForm } from '../components/BodyLogForm';
import { ErrorNotice } from '../components/Feedback';

export function RecordPage() {
  const { date } = useParams();
  const navigate = useNavigate();

  // Alt+← / Alt+→ で前日・翌日へ
  useEffect(() => {
    if (!date) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft') navigate(`/record/${addDays(date, -1)}`);
      if (e.key === 'ArrowRight') navigate(`/record/${addDays(date, 1)}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [date, navigate]);

  if (!date || !isValidDate(date)) return <Navigate to={`/record/${today()}`} replace />;
  return <RecordContent date={date} />;
}

function RecordContent({ date }: { date: string }) {
  const navigate = useNavigate();
  const body = useBodyLog(date);
  const isToday = date === today();

  return (
    <div className="stack">
      <div className="row">
        <div className="date-nav">
          <button type="button" onClick={() => navigate(`/record/${addDays(date, -1)}`)} aria-label="前の日" title="前の日（Alt+←）">
            ◀
          </button>
          <span className="date-title">{formatJaLong(date)}</span>
          <button type="button" onClick={() => navigate(`/record/${addDays(date, 1)}`)} aria-label="次の日" title="次の日（Alt+→）">
            ▶
          </button>
        </div>
        <input
          type="date"
          value={date}
          aria-label="日付を選ぶ"
          onChange={(e) => e.target.value && navigate(`/record/${e.target.value}`)}
          style={{ width: 'auto' }}
        />
        {!isToday && (
          <button type="button" onClick={() => navigate(`/record/${today()}`)}>
            今日
          </button>
        )}
      </div>

      <ErrorNotice error={body.error} />
      {body.data && <BodyLogForm date={date} detail={body.data} />}

      <div className="card">
        <h2>食事</h2>
        <p className="muted small" style={{ margin: 0 }}>
          食事の記録（朝食・昼食・夕食・その他）はフェーズ2で追加します。
        </p>
      </div>
    </div>
  );
}
