import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { applyMultiplier, kcalFromPfc, round, type Nutrients } from '../../shared/calc';
import { KCAL_PER_ITEM_WARN, type MealType } from '../../shared/constants';
import { mealEntryInputSchema, type MealEntryInput } from '../../shared/schemas';
import type { Food, MealEntry } from '../../shared/types';
import { useFoods } from '../api/hooks';
import { fmtG, parseNum } from '../utils/num';

type Fields = { foodName: string; amountNote: string; multiplier: string; kcal: string; proteinG: string; fatG: string; carbsG: string };
type NumKey = 'kcal' | 'proteinG' | 'fatG' | 'carbsG';

/** マイ食品から選んだ状態。base は倍率 1 のときの値 */
type Picked = { id: number; name: string; base: Nutrients };

const EMPTY: Fields = { foodName: '', amountNote: '', multiplier: '', kcal: '', proteinG: '', fatG: '', carbsG: '' };

const nutrientFields = (n: Nutrients) => ({
  kcal: String(n.kcal),
  proteinG: String(n.proteinG),
  fatG: String(n.fatG),
  carbsG: String(n.carbsG),
});

function fromEntry(e: MealEntry): Fields {
  return {
    foodName: e.foodName,
    amountNote: e.amountNote ?? '',
    multiplier: e.foodId != null && e.multiplier != null ? String(e.multiplier) : '',
    ...nutrientFields(e),
  };
}

/** 記録の値を倍率で割り戻して、倍率 1 のときの値を求める（記録時点の値が基準） */
function pickedFromEntry(e: MealEntry): Picked | null {
  if (e.foodId == null || e.multiplier == null || e.multiplier <= 0) return null;
  const m = e.multiplier;
  return {
    id: e.foodId,
    name: e.foodName,
    base: { kcal: e.kcal / m, proteinG: e.proteinG / m, fatG: e.fatG / m, carbsG: e.carbsG / m },
  };
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * 食事 1 品の入力フォーム（追加・編集で共用）。
 * - 食品名を打つとマイ食品の候補が出る（↑↓で選んで Enter）。選ぶと kcal・PFC が自動で入り、倍率で再計算される。
 * - kcal・PFC を手で書き換えると「手入力」に切り替わり、倍率は使えなくなる。
 * - Tab で次の欄、Enter で追加/保存。kcal を空欄にすると PFC から計算する。
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
  const [picked, setPicked] = useState<Picked | null>(entry ? pickedFromEntry(entry) : null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const nameRef = useRef<HTMLInputElement>(null);
  const multRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const isEdit = entry != null;

  useEffect(() => {
    if (isEdit) nameRef.current?.focus();
  }, [isEdit]);

  // ── 候補 ──
  const q = useDebounced(f.foodName.trim(), 150);
  const showSuggest = suggestOpen && q.length > 0 && picked == null;
  const foods = useFoods(q, showSuggest);
  const suggestions = showSuggest ? (foods.data ?? []) : [];
  useEffect(() => setActive(suggestions.length ? 0 : -1), [q, suggestions.length]);

  function pick(food: Food) {
    const base = { kcal: food.kcal, proteinG: food.proteinG, fatG: food.fatG, carbsG: food.carbsG };
    setPicked({ id: food.id, name: food.name, base });
    setF((s) => ({ ...s, foodName: food.name, amountNote: food.servingNote ?? '', multiplier: '1', ...nutrientFields(base) }));
    setSuggestOpen(false);
    setErrors({});
    // 倍率を調整してから Enter で追加できるように
    requestAnimationFrame(() => multRef.current?.select());
  }

  function onNameKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(suggestions[active]!);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // 編集のキャンセルではなく候補を閉じる
      setSuggestOpen(false);
    }
  }

  // ── 入力 ──
  function onNameChange(v: string) {
    setF((s) => ({ ...s, foodName: v }));
    setSuggestOpen(true);
    // 名前を変えたら、選んだ食品とのつながりを外す（値はそのまま残す）
    if (picked && v !== picked.name) {
      setPicked(null);
      setF((s) => ({ ...s, multiplier: '' }));
    }
  }

  function onMultiplierChange(v: string) {
    setF((s) => ({ ...s, multiplier: v }));
    const m = parseNum(v);
    if (picked && m != null && !Number.isNaN(m) && m > 0) {
      setF((s) => ({ ...s, multiplier: v, ...nutrientFields(applyMultiplier(picked.base, m)) }));
    }
  }

  function onNumChange(k: NumKey, v: string) {
    setF((s) => ({ ...s, [k]: v, ...(picked ? { multiplier: '' } : {}) }));
    // 手で書き換えたら「手入力」扱い（倍率は使えなくなる）
    if (picked) setPicked(null);
  }

  // kcal 空欄時に入る値の目安
  const p = parseNum(f.proteinG);
  const fat = parseNum(f.fatG);
  const c = parseNum(f.carbsG);
  const autoKcal =
    p != null && fat != null && c != null && !Number.isNaN(p) && !Number.isNaN(fat) && !Number.isNaN(c) ? kcalFromPfc(p, fat, c) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const mult = picked ? parseNum(f.multiplier) : null;
    const raw = {
      date,
      mealType,
      foodName: f.foodName,
      amountNote: f.amountNote.trim() || null,
      foodId: picked?.id ?? null,
      multiplier: mult == null ? null : round(mult, 2),
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
        errs[k] ??= raw[k as keyof typeof raw] === null ? '入力してください' : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    const kcal = parsed.data.kcal ?? autoKcal ?? 0;
    if (kcal > KCAL_PER_ITEM_WARN && !window.confirm(`${kcal}kcal と大きめの値です。このまま保存しますか？`)) return;

    const before = { f, picked };
    if (!isEdit) {
      // 連続入力できるよう、送信と同時に空にして食品名へ戻る
      setF(EMPTY);
      setPicked(null);
      setSuggestOpen(false);
      nameRef.current?.focus();
    }
    try {
      await onSubmit(parsed.data);
    } catch {
      // 失敗時は入力内容を戻す（エラー表示は呼び出し側）
      if (!isEdit) {
        setF(before.f);
        setPicked(before.picked);
      }
    }
  }

  const id = (k: string) => `${idPrefix}-${k}`;
  const num = (k: NumKey, label: string, placeholder?: string) => (
    <div className={`mf-field mf-${k}`}>
      <label htmlFor={id(k)}>{label}</label>
      <input
        id={id(k)}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={f[k]}
        onChange={(e) => onNumChange(k, e.target.value)}
        placeholder={placeholder}
        aria-invalid={!!errors[k]}
      />
    </div>
  );

  return (
    <form
      className={`meal-form${isEdit ? ' editing' : ''}`}
      onSubmit={submit}
      noValidate
      onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
    >
      <div className="mf-field mf-name">
        <label htmlFor={id('name')}>
          食品名{picked && <span className="mf-linked">マイ食品</span>}
        </label>
        <div className="combo">
          <input
            id={id('name')}
            ref={nameRef}
            type="text"
            autoComplete="off"
            role="combobox"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 && suggestions.length ? `${listId}-${active}` : undefined}
            value={f.foodName}
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={onNameKeyDown}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            placeholder={isEdit ? '' : '例：オートミール'}
            title="マイ食品に登録した食品は、名前の一部を入力すると候補に出ます"
            aria-invalid={!!errors.foodName}
          />
          {suggestions.length > 0 && (
            <ul className="suggest" role="listbox" id={listId} aria-label="マイ食品の候補">
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  // blur より先に選ぶため mousedown で処理
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="sg-name">
                    {s.name}
                    {s.servingNote && <span className="muted"> {s.servingNote}</span>}
                  </span>
                  <span className="sg-nut">
                    {s.kcal}kcal P{fmtG(s.proteinG)} F{fmtG(s.fatG)} C{fmtG(s.carbsG)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mf-field mf-amount">
        <label htmlFor={id('amount')}>量</label>
        <input
          id={id('amount')}
          type="text"
          autoComplete="off"
          value={f.amountNote}
          onChange={(e) => setF((s) => ({ ...s, amountNote: e.target.value }))}
          placeholder={isEdit ? '' : '例：40g'}
        />
      </div>
      <div className="mf-field mf-mult">
        <label htmlFor={id('mult')}>倍率</label>
        <input
          id={id('mult')}
          ref={multRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={f.multiplier}
          onChange={(e) => onMultiplierChange(e.target.value)}
          disabled={!picked}
          placeholder="—"
          title={picked ? 'マイ食品の基準量に対する倍率' : 'マイ食品を選んだときに使えます'}
          aria-invalid={!!errors.multiplier}
        />
      </div>
      {num('kcal', 'kcal', autoKcal != null ? `自動 ${autoKcal}` : '自動')}
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
      {Object.keys(errors).length > 0 && (
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
  multiplier: '倍率',
  kcal: 'kcal',
  proteinG: 'P',
  fatG: 'F',
  carbsG: 'C',
};
