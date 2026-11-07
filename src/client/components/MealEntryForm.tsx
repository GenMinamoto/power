import { useEffect, useRef, useState, type FormEvent } from 'react';
import { kcalFromPfc } from '../../shared/calc';
import { KCAL_PER_ITEM_WARN, type MealType } from '../../shared/constants';
import { mealEntryInputSchema, type MealEntryInput } from '../../shared/schemas';
import type { MealEntry } from '../../shared/types';
import { parseNum } from '../utils/num';

type Fields = { foodName: string; amountNote: string; kcal: string; proteinG: string; fatG: string; carbsG: string };

const EMPTY: Fields = { foodName: '', amountNote: '', kcal: '', proteinG: '', fatG: '', carbsG: '' };

const fromEntry = (e: MealEntry): Fields => ({
  foodName: e.foodName,
  amountNote: e.amountNote ?? '',
  kcal: String(e.kcal),
  proteinG: String(e.proteinG),
  fatG: String(e.fatG),
  carbsG: String(e.carbsG),
});

/**
 * 食事 1 品の入力フォーム（追加・編集で共用）。
 * Tab で次の欄、Enter で追加/保存。kcal を空欄にすると PFC から計算する。
 */
export function MealEntryForm({
  date,
  mealType,
  entry,
  onSubmit,
  onCancel,
  idPrefix,
}: {
  date: string;
  mealType: MealType;
  /** 編集時の元の値。省略時は追加フォーム */
  entry?: MealEntry;
  onSubmit: (input: MealEntryInput) => Promise<unknown> | void;
  onCancel?: () => void;
  idPrefix: string;
}) {
  const [f, setF] = useState<Fields>(entry ? fromEntry(entry) : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const isEdit = entry != null;

  useEffect(() => {
    if (isEdit) nameRef.current?.focus();
  }, [isEdit]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  // kcal 空欄時に入る値の目安
  const p = parseNum(f.proteinG);
  const fat = parseNum(f.fatG);
  const c = parseNum(f.carbsG);
  const autoKcal =
    p != null && fat != null && c != null && !Number.isNaN(p) && !Number.isNaN(fat) && !Number.isNaN(c) ? kcalFromPfc(p, fat, c) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const raw = {
      date,
      mealType,
      foodName: f.foodName,
      amountNote: f.amountNote.trim() || null,
      // フェーズ3（マイ食品）で使う。手入力ではなし
      foodId: null,
      multiplier: null,
      kcal: parseNum(f.kcal),
      proteinG: parseNum(f.proteinG),
      fatG: parseNum(f.fatG),
      carbsG: parseNum(f.carbsG),
      memo: entry?.memo ?? null,
    };
    const parsed = mealEntryInputSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]);
        // P/F/C の未入力は「入力してください」と出す
        errs[k] ??= raw[k as keyof typeof raw] === null ? '入力してください' : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    const kcal = parsed.data.kcal ?? autoKcal ?? 0;
    if (kcal > KCAL_PER_ITEM_WARN && !window.confirm(`${kcal}kcal と大きめの値です。このまま保存しますか？`)) return;

    if (!isEdit) {
      // 連続入力できるよう、送信と同時に空にして食品名へ戻る
      setF(EMPTY);
      nameRef.current?.focus();
    }
    try {
      await onSubmit(parsed.data);
    } catch {
      // 失敗時は入力内容を戻す（エラー表示は呼び出し側）
      if (!isEdit) setF(f);
    }
  }

  const id = (k: string) => `${idPrefix}-${k}`;
  const num = (k: 'kcal' | 'proteinG' | 'fatG' | 'carbsG', label: string, placeholder?: string) => (
    <div className={`mf-field mf-${k}`}>
      <label htmlFor={id(k)}>{label}</label>
      <input
        id={id(k)}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={f[k]}
        onChange={set(k)}
        placeholder={placeholder}
        aria-invalid={!!errors[k]}
      />
    </div>
  );

  const errorList = Object.values(errors);

  return (
    <form className={`meal-form${isEdit ? ' editing' : ''}`} onSubmit={submit} noValidate onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
      <div className="mf-field mf-name">
        <label htmlFor={id('name')}>食品名</label>
        <input
          id={id('name')}
          ref={nameRef}
          type="text"
          autoComplete="off"
          value={f.foodName}
          onChange={set('foodName')}
          placeholder={isEdit ? '' : '例：オートミール'}
          aria-invalid={!!errors.foodName}
        />
      </div>
      <div className="mf-field mf-amount">
        <label htmlFor={id('amount')}>量</label>
        <input id={id('amount')} type="text" autoComplete="off" value={f.amountNote} onChange={set('amountNote')} placeholder={isEdit ? '' : '例：40g'} />
      </div>
      {num('kcal', 'kcal',autoKcal != null ? `自動 ${autoKcal}` : '自動')}
      {num('proteinG', 'P (g)')}
      {num('fatG', 'F (g)')}
      {num('carbsG', 'C (g)')}
      <div className="mf-actions">
        <button type="submit" className={isEdit ? 'primary' : ''}>
          {isEdit ? '保存' : '追加'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
      {errorList.length > 0 && (
        <div className="mf-errors field-error" role="alert">
          {Object.entries(errors)
            .map(([k, m]) => `${LABELS[k] ?? k}：${m}`)
            .join(' ／ ')}
        </div>
      )}
    </form>
  );
}

const LABELS: Record<string, string> = {
  foodName: '食品名',
  amountNote: '量',
  kcal: 'kcal',
  proteinG: 'P',
  fatG: 'F',
  carbsG: 'C',
};
