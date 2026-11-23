import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { addDays, formatJaLong, isValidDate, today } from '../../shared/date';
import { MEAL_TYPES } from '../../shared/constants';
import { useBodyLog, useMeals, useWorkouts } from '../api/hooks';
import { BodyLogForm } from '../components/BodyLogForm';
import { CopyMeals } from '../components/CopyMeals';
import { ErrorNotice } from '../components/Feedback';
import { IntakeProgress, withBonus } from '../components/IntakeProgress';
import { MealSection } from '../components/MealSection';
import { BonusNote, WorkoutCard } from '../components/WorkoutCard';

export function RecordPage() {
  const { date } = useParams();
  const navigate = useNavigate();

  // Alt+← / Alt+→ で前日・翌日へ
  useEffect(() => {
    if (!date) return;
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
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

      <MealsCard date={date} />

      <WorkoutCard date={date} />
    </div>
  );
}

function MealsCard({ date }: { date: string }) {
  const meals = useMeals(date);
  const workouts = useWorkouts(date);
  const d = meals.data;
  const bonus = workouts.data?.bonus;
  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>食事</h2>
        <span className="spacer" />
        <CopyMeals key={date} date={date} />
      </div>
      <ErrorNotice error={meals.error} />
      {d &&
        MEAL_TYPES.map((t) => (
          <MealSection key={t} date={date} mealType={t} entries={d.entries.filter((e) => e.mealType === t)} subtotal={d.subtotals[t]} />
        ))}
      {d && (
        <div className="daily-total">
          <h3>1日合計</h3>
          <IntakeProgress intake={d.total} goal={withBonus(d.goal, bonus)} />
          {d.goal && bonus && <BonusNote bonus={bonus} />}
        </div>
      )}
    </div>
  );
}
