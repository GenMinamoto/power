import { useState } from 'react';
import { MEAL_LABELS, MEAL_TYPES, type MealType } from '../../shared/constants';
import { addDays, formatShort } from '../../shared/date';
import { useCopyMeals } from '../api/hooks';
import { useFeedback } from './Feedback';

/** 過去日の食事を、表示中の日にコピーする（初期値は前日・全区分） */
export function CopyMeals({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => addDays(date, -1));
  const [mealType, setMealType] = useState<MealType | 'all'>('all');
  const copy = useCopyMeals();
  const { toast } = useFeedback();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setFrom(addDays(date, -1));
          copy.reset();
          setOpen(true);
        }}
      >
        過去の食事をコピー
      </button>
    );
  }

  async function run() {
    try {
      const r = await copy.mutateAsync({ fromDate: from, toDate: date, mealType: mealType === 'all' ? null : mealType });
      toast(`${formatShort(from)} の食事を ${r.copied} 品コピーしました`);
      setOpen(false);
    } catch {
      /* エラーは下に表示 */
    }
  }

  return (
    <div className="copy-panel" role="group" aria-label="過去の食事をコピー">
      <label className="field">
        コピー元の日
        <input type="date" value={from} max={addDays(date, -1)} onChange={(e) => e.target.value && setFrom(e.target.value)} />
      </label>
      <label className="field">
        区分
        <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType | 'all')}>
          <option value="all">1日分すべて</option>
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {MEAL_LABELS[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="row" style={{ alignSelf: 'flex-end' }}>
        <button type="button" className="primary" onClick={run} disabled={copy.isPending}>
          コピー
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          閉じる
        </button>
      </div>
      {copy.error && <div className="field-error" style={{ flexBasis: '100%' }}>{copy.error.message}</div>}
    </div>
  );
}
