import { useEffect, useRef, useState, type FormEvent } from 'react';
import { kcalFromPfc, kcalMismatch } from '../../shared/calc';
import { foodInputSchema, type FoodInput } from '../../shared/schemas';
import type { Food } from '../../shared/types';
import { useCreateFood, useDeleteFood, useFoods, useUpdateFood } from '../api/hooks';
import { ErrorNotice, useFeedback } from '../components/Feedback';
import { fmtG, parseNum } from '../utils/num';

type Fields = { name: string; servingNote: string; kcal: string; proteinG: string; fatG: string; carbsG: string };
const EMPTY: Fields = { name: '', servingNote: '', kcal: '', proteinG: '', fatG: '', carbsG: '' };
const LABELS: Record<string, string> = { name: '食品名', servingNote: '基準量', kcal: 'kcal', proteinG: 'P', fatG: 'F', carbsG: 'C' };

const fromFood = (f: Food): Fields => ({
  name: f.name,
  servingNote: f.servingNote ?? '',
  kcal: String(f.kcal),
  proteinG: String(f.proteinG),
  fatG: String(f.fatG),
  carbsG: String(f.carbsG),
});

/** 食品の登録・編集フォーム */
function FoodForm({
  initial,
  submitLabel,
  idPrefix,
  onSubmit,
  onCancel,
}: {
  initial: Fields;
  submitLabel: string;
  idPrefix: string;
  onSubmit: (input: FoodInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const isEdit = onCancel != null;

  // 編集を開いたら食品名へフォーカス（Esc でキャンセルできるように）
  useEffect(() => {
    if (isEdit) nameRef.current?.focus();
  }, [isEdit]);

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const p = parseNum(f.proteinG);
  const fat = parseNum(f.fatG);
  const c = parseNum(f.carbsG);
  const autoKcal = [p, fat, c].every((v) => v != null && !Number.isNaN(v)) ? kcalFromPfc(p!, fat!, c!) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const raw = {
      name: f.name,
      servingNote: f.servingNote.trim() || null,
      kcal: parseNum(f.kcal),
      proteinG: parseNum(f.proteinG),
      fatG: parseNum(f.fatG),
      carbsG: parseNum(f.carbsG),
    };
    const parsed = foodInputSchema.safeParse(raw);
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
    try {
      await onSubmit(parsed.data);
    } catch {
      return; // エラーは呼び出し側で表示。入力内容は残す
    }
    if (!onCancel) {
      setF(EMPTY);
      nameRef.current?.focus();
    }
  }

  const input = (k: keyof Fields, label: string, opts: { placeholder?: string; numeric?: boolean } = {}) => (
    <div className={`mf-field ff-${k}`}>
      <label htmlFor={`${idPrefix}-${k}`}>{label}</label>
      <input
        id={`${idPrefix}-${k}`}
        ref={k === 'name' ? nameRef : undefined}
        type="text"
        inputMode={opts.numeric ? 'decimal' : undefined}
        autoComplete="off"
        value={f[k]}
        onChange={set(k)}
        placeholder={opts.placeholder}
        aria-invalid={!!errors[k]}
      />
    </div>
  );

  return (
    <form className="food-form" onSubmit={submit} noValidate onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}>
      {input('name', '食品名', { placeholder: onCancel ? '' : '例：卵' })}
      {input('servingNote', '基準量', { placeholder: onCancel ? '' : '例：1個、100g' })}
      {input('kcal', 'kcal', { placeholder: autoKcal != null ? `自動 ${autoKcal}` : '自動', numeric: true })}
      {input('proteinG', 'P (g)', { numeric: true })}
      {input('fatG', 'F (g)', { numeric: true })}
      {input('carbsG', 'C (g)', { numeric: true })}
      <div className="mf-actions">
        <button type="submit" className="primary">
          {submitLabel}
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

function FoodRow({ food }: { food: Food }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateFood();
  const del = useDeleteFood();
  const { toast } = useFeedback();

  if (editing) {
    return (
      <tr>
        <td colSpan={8} className="editing-cell">
          <FoodForm
            initial={fromFood(food)}
            submitLabel="保存"
            idPrefix={`food-${food.id}`}
            onCancel={() => setEditing(false)}
            onSubmit={async (input) => {
              await update.mutateAsync({ id: food.id, input });
              setEditing(false);
              toast('保存しました');
            }}
          />
          {update.error && <div className="field-error">{update.error.message}</div>}
        </td>
      </tr>
    );
  }

  const mismatch = kcalMismatch(food.kcal, food.proteinG, food.fatG, food.carbsG);
  return (
    <tr>
      <td className="c-name">{food.name}</td>
      <td className="c-serving secondary">{food.servingNote ?? ''}</td>
      <td className="c-num" data-label="kcal">
        {mismatch && (
          <span className="mismatch" title={`P・F・C から計算すると ${kcalFromPfc(food.proteinG, food.fatG, food.carbsG)}kcal です`}>
            !
          </span>
        )}
        {food.kcal}
      </td>
      <td className="c-num" data-label="P">{fmtG(food.proteinG)}</td>
      <td className="c-num" data-label="F">{fmtG(food.fatG)}</td>
      <td className="c-num" data-label="C">{fmtG(food.carbsG)}</td>
      <td className="c-use muted">{food.useCount}</td>
      <td className="actions-cell">
        <button type="button" className="small-btn" onClick={() => setEditing(true)} aria-label={`${food.name}を編集`}>
          編集
        </button>
        <button
          type="button"
          className="small-btn danger"
          aria-label={`${food.name}を削除`}
          onClick={async () => {
            if (!window.confirm(`「${food.name}」をマイ食品から削除しますか？\n（これまでの食事の記録は消えません）`)) return;
            await del.mutateAsync(food.id);
            toast('削除しました');
          }}
        >
          削除
        </button>
      </td>
    </tr>
  );
}

export function FoodsPage() {
  const [q, setQ] = useState('');
  const query = q.trim();
  const foods = useFoods(query);
  const create = useCreateFood();
  const { toast } = useFeedback();
  const list = foods.data ?? [];

  return (
    <div className="stack">
      <h1>マイ食品</h1>
      <div className="card stack">
        <h2>新しく登録</h2>
        <p className="small muted" style={{ margin: 0 }}>
          よく食べるものを基準量（例：卵 1個、白米 150g）の値で登録すると、食事の記録で名前を選ぶだけで入力でき、倍率で量を調整できます。kcal
          を空欄にすると P・F・C から計算します。
        </p>
        <FoodForm
          initial={EMPTY}
          submitLabel="登録"
          idPrefix="new-food"
          onSubmit={async (input) => {
            await create.mutateAsync(input);
            toast(`「${input.name}」を登録しました`);
          }}
        />
        {create.error && <div className="field-error">{create.error.message}</div>}
      </div>

      <div className="card stack">
        <div className="row">
          <h2 style={{ margin: 0 }}>登録済み</h2>
          <span className="small muted">{query ? `${list.length}件ヒット` : `${list.length}件`}</span>
          <span className="spacer" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="検索（名前・基準量）" aria-label="マイ食品を検索" />
        </div>
        <ErrorNotice error={foods.error} />
        {list.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {query ? '見つかりませんでした。' : 'まだ登録がありません。'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data foods-table">
              <thead>
                <tr>
                  <th>食品名</th>
                  <th style={{ textAlign: 'left' }}>基準量</th>
                  <th>kcal</th>
                  <th>P (g)</th>
                  <th>F (g)</th>
                  <th>C (g)</th>
                  <th title="食事の記録で使った回数">使用</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <FoodRow key={f.id} food={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
