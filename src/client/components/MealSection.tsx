import { useState } from 'react';
import { kcalFromPfc, kcalMismatch, round, type Nutrients } from '../../shared/calc';
import { MEAL_LABELS, type MealType } from '../../shared/constants';
import type { Food, MealEntry } from '../../shared/types';
import { api } from '../api/client';
import { useAddMeal, useCreateFood, useDeleteMeal, useUpdateMeal } from '../api/hooks';
import { fmtG } from '../utils/num';
import { useFeedback } from './Feedback';
import { MealEntryForm } from './MealEntryForm';

export function NutrientsText({ n }: { n: Nutrients }) {
  return (
    <span className="nutrients">
      <strong>{n.kcal.toLocaleString()}</strong>kcal <span>P {fmtG(n.proteinG)}</span> <span>F {fmtG(n.fatG)}</span>{' '}
      <span>C {fmtG(n.carbsG)}</span>
    </span>
  );
}

function EntryRow({ entry, date }: { entry: MealEntry; date: string }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateMeal(date);
  const del = useDeleteMeal(date);
  const createFood = useCreateFood();
  const { toast } = useFeedback();
  const pending = entry.id < 0; // 保存中（楽観的に表示している行）

  if (editing) {
    return (
      <li className="meal-row editing">
        <MealEntryForm
          date={date}
          mealType={entry.mealType}
          entry={entry}
          idPrefix={`edit-${entry.id}`}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            setEditing(false);
            await update.mutateAsync({ id: entry.id, input });
            toast('保存しました');
          }}
        />
      </li>
    );
  }

  const mismatch = kcalMismatch(entry.kcal, entry.proteinG, entry.fatG, entry.carbsG);

  /** 記録した内容をマイ食品に登録（倍率があれば 1 倍の値に割り戻す） */
  async function registerFood() {
    const same = await api<Food[]>(`/api/foods?q=${encodeURIComponent(entry.foodName)}`);
    if (same.some((s) => s.name === entry.foodName)) {
      if (!window.confirm(`「${entry.foodName}」はマイ食品に登録済みです。別の食品として追加で登録しますか？`)) return;
    }
    const m = entry.multiplier && entry.multiplier > 0 ? entry.multiplier : 1;
    await createFood.mutateAsync({
      name: entry.foodName,
      servingNote: entry.amountNote,
      kcal: Math.round(entry.kcal / m),
      proteinG: round(entry.proteinG / m, 1),
      fatG: round(entry.fatG / m, 1),
      carbsG: round(entry.carbsG / m, 1),
    });
    toast(`「${entry.foodName}」をマイ食品に登録しました`);
  }

  return (
    <li className={`meal-row${pending ? ' pending' : ''}`}>
      <span className="mr-name">
        {entry.foodName}
        {entry.amountNote && <span className="muted"> {entry.amountNote}</span>}
        {entry.multiplier != null && entry.multiplier !== 1 && <span className="mr-mult"> ×{entry.multiplier}</span>}
      </span>
      <span className="mr-kcal">
        {mismatch && (
          <span
            className="mismatch"
            title={`P・F・C から計算すると ${kcalFromPfc(entry.proteinG, entry.fatG, entry.carbsG)}kcal です。入力値を確認してください`}
            aria-label="kcal と PFC が合っていません"
          >
            !
          </span>
        )}
        {entry.kcal.toLocaleString()}
        <span className="unit">kcal</span>
      </span>
      <span className="mr-pfc">
        <span>P {fmtG(entry.proteinG)}</span>
        <span>F {fmtG(entry.fatG)}</span>
        <span>C {fmtG(entry.carbsG)}</span>
      </span>
      <span className="mr-actions">
        {entry.foodId == null && (
          <button
            type="button"
            className="small-btn"
            disabled={pending || createFood.isPending}
            title="この内容をマイ食品に登録"
            aria-label={`${entry.foodName}をマイ食品に登録`}
            onClick={registerFood}
          >
            ☆
          </button>
        )}
        <button type="button" className="small-btn" onClick={() => setEditing(true)} disabled={pending} aria-label={`${entry.foodName}を編集`}>
          編集
        </button>
        <button
          type="button"
          className="small-btn danger"
          disabled={pending}
          aria-label={`${entry.foodName}を削除`}
          onClick={async () => {
            if (!window.confirm(`「${entry.foodName}」を削除しますか？`)) return;
            await del.mutateAsync(entry.id);
            toast('削除しました');
          }}
        >
          削除
        </button>
      </span>
    </li>
  );
}

export function MealSection({
  date,
  mealType,
  entries,
  subtotal,
}: {
  date: string;
  mealType: MealType;
  entries: MealEntry[];
  subtotal: Nutrients;
}) {
  const add = useAddMeal(date);
  const label = MEAL_LABELS[mealType];
  const error = add.error;

  return (
    <section className="meal-section" aria-labelledby={`meal-${mealType}-title`}>
      <div className="meal-head">
        <h3 id={`meal-${mealType}-title`}>{label}</h3>
        {entries.length > 0 && (
          <span className="small secondary">
            小計 <NutrientsText n={subtotal} />
          </span>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="meal-list">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} date={date} />
          ))}
        </ul>
      )}
      <MealEntryForm date={date} mealType={mealType} idPrefix={`add-${mealType}`} onSubmit={(input) => add.mutateAsync(input)} />
      {error && <div className="field-error">{error.message}</div>}
    </section>
  );
}
