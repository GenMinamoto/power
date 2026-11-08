import { forwardRef, useImperativeHandle, useRef, useState, type FormEvent } from 'react';
import { kcalFromPfc } from '../../shared/calc';
import { formatJaLong, formatShort, today } from '../../shared/date';
import { goalInputSchema } from '../../shared/schemas';
import type { Goal } from '../../shared/types';
import { useDeleteGoal, useSaveGoal } from '../api/hooks';
import { ErrorNotice, useFeedback } from './Feedback';
import type { PlanValues } from './PlanCalculator';
import { fmtG, parseNum } from '../utils/num';

type Fields = {
  startDate: string;
  kcal: string;
  proteinG: string;
  fatG: string;
  carbsG: string;
  targetWeightKg: string;
  targetBodyFatPct: string;
  targetDate: string;
};

const LABELS: Record<keyof Fields, string> = {
  startDate: '適用開始日',
  kcal: 'カロリー',
  proteinG: 'P',
  fatG: 'F',
  carbsG: 'C',
  targetWeightKg: '目標体重',
  targetBodyFatPct: '目標体脂肪率',
  targetDate: '目標期日',
};

const s = (v: number | null) => (v == null ? '' : String(v));
const fromGoal = (g: Goal | null, startDate: string): Fields => ({
  startDate,
  kcal: s(g?.kcal ?? null),
  proteinG: s(g?.proteinG ?? null),
  fatG: s(g?.fatG ?? null),
  carbsG: s(g?.carbsG ?? null),
  targetWeightKg: s(g?.targetWeightKg ?? null),
  targetBodyFatPct: s(g?.targetBodyFatPct ?? null),
  targetDate: g?.targetDate ?? '',
});

/** 今日に適用される目標（goals は開始日の新しい順） */
export const currentGoal = (goals: Goal[], date = today()) => goals.find((g) => g.startDate <= date) ?? null;

export type GoalFormHandle = { fill: (v: PlanValues) => void; load: (g: Goal) => void };

/** 目標の入力。初期値は今日の目標（無ければ空）、適用開始日は今日 */
export const GoalForm = forwardRef<GoalFormHandle, { goals: Goal[] }>(function GoalForm({ goals }, ref) {
  const [f, setF] = useState<Fields>(() => fromGoal(currentGoal(goals), today()));
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const save = useSaveGoal();
  const { toast } = useFeedback();
  const formRef = useRef<HTMLFormElement>(null);
  const kcalRef = useRef<HTMLInputElement>(null);

  const reveal = () => {
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    kcalRef.current?.focus({ preventScroll: true });
  };
  useImperativeHandle(ref, () => ({
    fill: (v) => {
      setF((x) => ({ ...x, kcal: String(v.kcal), proteinG: String(v.proteinG), fatG: String(v.fatG), carbsG: String(v.carbsG) }));
      reveal();
    },
    load: (g) => {
      setF(fromGoal(g, g.startDate));
      reveal();
    },
  }));

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  // P・F・C から計算した kcal と目標 kcal の差（参考表示）
  const nums = [f.kcal, f.proteinG, f.fatG, f.carbsG].map(parseNum);
  const pfcKcal = nums.slice(1).every((v) => v != null && !Number.isNaN(v)) ? kcalFromPfc(nums[1]!, nums[2]!, nums[3]!) : null;
  const kcalDiff = pfcKcal != null && nums[0] != null && !Number.isNaN(nums[0]) ? pfcKcal - Math.round(nums[0]) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const raw = {
      startDate: f.startDate,
      kcal: parseNum(f.kcal),
      proteinG: parseNum(f.proteinG),
      fatG: parseNum(f.fatG),
      carbsG: parseNum(f.carbsG),
      targetWeightKg: parseNum(f.targetWeightKg),
      targetBodyFatPct: parseNum(f.targetBodyFatPct),
      targetDate: f.targetDate || null,
    };
    const parsed = goalInputSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Partial<Record<keyof Fields, string>> = {};
      for (const i of parsed.error.issues) {
        const k = String(i.path[0]) as keyof Fields;
        errs[k] ??= raw[k] === null || raw[k] === '' ? '入力してください' : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    const input = parsed.data;
    if (goals.some((g) => g.startDate === input.startDate)) {
      if (!window.confirm(`${formatJaLong(input.startDate)} から始まる目標はすでにあります。上書きしますか？`)) return;
    }
    await save.mutateAsync(input);
    toast(`目標を保存しました（${formatShort(input.startDate)} から適用）`);
  }

  const input = (k: keyof Fields, label: string, unit: string, opts: { type?: 'date'; refEl?: React.Ref<HTMLInputElement> } = {}) => (
    <div className={`gf-field gf-${k}`}>
      <label htmlFor={`goal-${k}`}>{label}</label>
      <div className="input-unit">
        <input
          id={`goal-${k}`}
          ref={opts.refEl}
          type={opts.type ?? 'text'}
          inputMode={opts.type ? undefined : 'decimal'}
          autoComplete="off"
          value={f[k]}
          onChange={set(k)}
          aria-invalid={!!errors[k]}
        />
        {unit && <span className="secondary">{unit}</span>}
      </div>
    </div>
  );

  return (
    <form ref={formRef} className="stack goal-form" onSubmit={submit} noValidate aria-label="目標">
      <div className="gf-grid">
        {input('startDate', '適用開始日', '', { type: 'date' })}
        {input('kcal', 'カロリー', 'kcal', { refEl: kcalRef })}
        {input('proteinG', 'P（たんぱく質）', 'g')}
        {input('fatG', 'F（脂質）', 'g')}
        {input('carbsG', 'C（炭水化物）', 'g')}
      </div>
      {kcalDiff != null && Math.abs(kcalDiff) > 20 && (
        <p className="small secondary" style={{ margin: 0 }}>
          P・F・C から計算すると {pfcKcal!.toLocaleString()} kcal です（カロリーと {kcalDiff > 0 ? '+' : ''}
          {kcalDiff} kcal の差）。
        </p>
      )}
      <div className="gf-grid">
        {input('targetWeightKg', '目標体重（任意）', 'kg')}
        {input('targetBodyFatPct', '目標体脂肪率（任意）', '%')}
        {input('targetDate', '目標期日（任意）', '', { type: 'date' })}
      </div>
      {Object.keys(errors).length > 0 && (
        <div className="field-error" role="alert">
          {Object.entries(errors)
            .map(([k, m]) => `${LABELS[k as keyof Fields]}：${m}`)
            .join(' ／ ')}
        </div>
      )}
      <div className="row">
        <button type="submit" className="primary" disabled={save.isPending}>
          目標を保存
        </button>
        <span className="small muted">適用開始日から次の目標までの日に使われます。それより前の日は以前の目標のままです。</span>
      </div>
      <ErrorNotice error={save.error} />
    </form>
  );
});

/** 目標の履歴（新しい順） */
export function GoalHistory({ goals, onEdit }: { goals: Goal[]; onEdit: (g: Goal) => void }) {
  const del = useDeleteGoal();
  const { toast } = useFeedback();
  const current = currentGoal(goals);
  const t = today();

  if (goals.length === 0) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        まだ目標がありません。
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="data goals-table">
        <thead>
          <tr>
            <th>適用開始日</th>
            <th>kcal</th>
            <th>P / F / C (g)</th>
            <th>体の目標</th>
            <th>状態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {goals.map((g) => {
            const state = g.startDate > t ? '予定' : g.id === current?.id ? '適用中' : '終了';
            const body = [
              g.targetWeightKg != null ? `${g.targetWeightKg}kg` : null,
              g.targetBodyFatPct != null ? `${g.targetBodyFatPct}%` : null,
              g.targetDate ? `〜${formatShort(g.targetDate)}` : null,
            ].filter(Boolean);
            return (
              <tr key={g.id} className={state === '適用中' ? 'current' : undefined}>
                <td className="c-start">{formatJaLong(g.startDate)}</td>
                <td className="c-kcal" data-label="kcal">{g.kcal.toLocaleString()}</td>
                <td className="c-pfc" data-label="P/F/C">
                  {fmtG(g.proteinG)} / {fmtG(g.fatG)} / {fmtG(g.carbsG)}
                </td>
                <td className="c-body secondary">{body.length ? body.join('・') : '—'}</td>
                <td className="c-state">
                  <span className={`badge${state === '適用中' ? ' badge-current' : ''}`}>{state}</span>
                </td>
                <td className="actions-cell">
                  <button type="button" className="small-btn" onClick={() => onEdit(g)} aria-label={`${formatShort(g.startDate)}からの目標をフォームに読み込む`}>
                    読み込む
                  </button>
                  <button
                    type="button"
                    className="small-btn danger"
                    aria-label={`${formatShort(g.startDate)}からの目標を削除`}
                    onClick={async () => {
                      if (!window.confirm(`${formatJaLong(g.startDate)} からの目標を削除しますか？\nこの期間の日は、その前の目標で比較されるようになります。`)) return;
                      await del.mutateAsync(g.id);
                      toast('目標を削除しました');
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ErrorNotice error={del.error} />
    </div>
  );
}
