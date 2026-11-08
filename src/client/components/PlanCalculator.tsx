import { useEffect, useRef, useState } from 'react';
import { targetPlan, type PlanWarning } from '../../shared/calc';
import { ACTIVITY_LEVELS, DEFICIT_OPTIONS, LIMITS } from '../../shared/constants';
import { ageOn, isValidDate, today } from '../../shared/date';
import { profileInputSchema, type ProfileInput } from '../../shared/schemas';
import type { Profile } from '../../shared/types';
import { useSaveProfile } from '../api/hooks';
import { parseNum } from '../utils/num';

export type PlanValues = { kcal: number; proteinG: number; fatG: number; carbsG: number };

type Fields = {
  sex: '' | 'male' | 'female';
  birthDate: string;
  heightCm: string;
  bmrKcal: string;
  activityLevel: string;
  deficitPct: string;
  proteinPerKg: string;
  fatPct: string;
};

const fromProfile = (p: Profile): Fields => ({
  sex: p.sex ?? '',
  birthDate: p.birthDate ?? '',
  heightCm: p.heightCm == null ? '' : String(p.heightCm),
  bmrKcal: p.bmrKcal == null ? '' : String(p.bmrKcal),
  activityLevel: String(p.activityLevel),
  deficitPct: String(p.deficitPct),
  proteinPerKg: p.proteinPerKg.toFixed(1),
  fatPct: String(p.fatPct),
});

const LABELS: Record<string, string> = {
  sex: '性別',
  birthDate: '生年月日',
  heightCm: '身長',
  bmrKcal: '基礎代謝',
  activityLevel: '活動レベル',
  deficitPct: '減量ペース',
  proteinPerKg: 'たんぱく質',
  fatPct: '脂質',
};

const WARNING_TEXT: Record<Exclude<PlanWarning, 'MISSING_PROFILE'>, string> = {
  BELOW_BMR: '目標が基礎代謝を下回っています。筋肉が落ちやすくなるため、減量ペースをゆるめることをおすすめします。',
  CARBS_NEGATIVE: '炭水化物に回せるカロリーがありません（0g にしています）。たんぱく質の係数か脂質の割合を下げてください。',
};

const n = (v: number) => v.toLocaleString();

function toInput(f: Fields): { raw: Record<keyof Fields, unknown>; parsed: ReturnType<typeof profileInputSchema.safeParse> } {
  const raw = {
    sex: f.sex === '' ? null : f.sex,
    birthDate: f.birthDate === '' ? null : f.birthDate,
    heightCm: parseNum(f.heightCm),
    bmrKcal: parseNum(f.bmrKcal),
    activityLevel: Number(f.activityLevel),
    deficitPct: Number(f.deficitPct),
    proteinPerKg: parseNum(f.proteinPerKg),
    fatPct: parseNum(f.fatPct),
  };
  return { raw, parsed: profileInputSchema.safeParse(raw) };
}

/**
 * プロフィール兼・目安計算機。入力を変えるたびにその場で計算し、
 * プロフィール項目は正しい値になった時点で自動保存する（体重は保存しない）。
 */
export function PlanCalculator({
  profile,
  latestWeight,
  onApply,
}: {
  profile: Profile;
  latestWeight: { kg: number; date: string } | null;
  onApply: (v: PlanValues) => void;
}) {
  const [f, setF] = useState<Fields>(() => fromProfile(profile));
  const [weight, setWeight] = useState(latestWeight ? String(latestWeight.kg) : '');
  const save = useSaveProfile();
  const [initialJson] = useState(() => {
    const p = profileInputSchema.safeParse(profile);
    return p.success ? JSON.stringify(p.data) : null;
  });
  const savedJson = useRef(initialJson);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const { raw, parsed } = toInput(f);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const k = String(i.path[0]);
      errors[k] ??= i.message;
    }
  }

  // 正しい値になったら 0.6 秒後に保存（打っている途中で何度も保存しない）
  const json = parsed.success ? JSON.stringify(parsed.data) : null;
  const { mutate } = save;
  useEffect(() => {
    if (json == null || json === savedJson.current) return;
    const t = window.setTimeout(() => {
      setStatus('saving');
      mutate(JSON.parse(json) as ProfileInput, {
        onSuccess: () => {
          savedJson.current = json;
          setStatus('saved');
        },
        onError: () => setStatus('idle'),
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [json, mutate]);

  const age = f.birthDate && isValidDate(f.birthDate) && !errors.birthDate ? ageOn(f.birthDate, today()) : null;
  const w = parseNum(weight);
  const weightOk = w != null && !Number.isNaN(w) && w >= LIMITS.weightKg.min && w <= LIMITS.weightKg.max;

  const plan = (() => {
    if (!weightOk || !parsed.success) return null;
    const p = parsed.data;
    return targetPlan({
      sex: p.sex,
      age,
      heightCm: p.heightCm,
      weightKg: w!,
      bmrKcal: p.bmrKcal,
      activityLevel: p.activityLevel,
      deficitPct: p.deficitPct,
      proteinPerKg: p.proteinPerKg,
      fatPct: p.fatPct,
    });
  })();

  const field = (k: keyof Fields, label: string, unit: string, opts: { placeholder?: string; hint?: string } = {}) => (
    <div className="pf-field">
      <label htmlFor={`pf-${k}`}>{label}</label>
      <div className="input-unit">
        <input
          id={`pf-${k}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={f[k]}
          onChange={set(k)}
          placeholder={opts.placeholder}
          aria-invalid={!!errors[k]}
          aria-describedby={opts.hint ? `pf-${k}-hint` : undefined}
        />
        <span className="secondary">{unit}</span>
      </div>
      {opts.hint && (
        <span id={`pf-${k}-hint`} className="pf-hint">
          {opts.hint}
        </span>
      )}
    </div>
  );

  const sexLabel = raw.sex === 'female' ? '女性' : '男性';

  return (
    <div className="stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>プロフィールと目安計算</h2>
        <span className="small muted" aria-live="polite">
          {status === 'saving' ? '保存中…' : status === 'saved' ? '✓ プロフィールに保存しました' : ''}
        </span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        入力するとすぐに目安を計算します。体重以外の項目はプロフィールとして自動で保存されます。
      </p>

      <div className="pf-grid">
        <div className="pf-field">
          <label htmlFor="pf-sex">性別</label>
          <select id="pf-sex" value={f.sex} onChange={set('sex')}>
            <option value="">未設定</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </div>
        <div className="pf-field">
          <label htmlFor="pf-birthDate">生年月日</label>
          <div className="input-unit">
            <input id="pf-birthDate" type="date" value={f.birthDate} onChange={set('birthDate')} aria-invalid={!!errors.birthDate} />
          </div>
          {age != null && <span className="pf-hint">{age}歳</span>}
        </div>
        {field('heightCm', '身長', 'cm')}
        <div className="pf-field">
          <label htmlFor="pf-weight">体重</label>
          <div className="input-unit">
            <input
              id="pf-weight"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-invalid={weight !== '' && !weightOk}
              aria-describedby="pf-weight-hint"
            />
            <span className="secondary">kg</span>
          </div>
          <span id="pf-weight-hint" className="pf-hint">
            {latestWeight ? `最新の記録（${latestWeight.date.slice(5).replace('-', '/')}）` : '記録がないので入力してください'}
          </span>
        </div>
        {field('bmrKcal', '基礎代謝（任意）', 'kcal', { hint: '空欄なら式で計算。体組成計の値があれば入力' })}
        <div className="pf-field pf-wide">
          <label htmlFor="pf-activityLevel">活動レベル</label>
          <select id="pf-activityLevel" value={f.activityLevel} onChange={set('activityLevel')}>
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a.value} value={String(a.value)}>
                {a.label}（×{a.value}）
              </option>
            ))}
          </select>
        </div>
        <div className="pf-field">
          <label htmlFor="pf-deficitPct">減量ペース</label>
          <select id="pf-deficitPct" value={f.deficitPct} onChange={set('deficitPct')}>
            {!DEFICIT_OPTIONS.some((o) => String(o.value) === f.deficitPct) && (
              <option value={f.deficitPct}>−{f.deficitPct}%</option>
            )}
            {DEFICIT_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {field('proteinPerKg', 'たんぱく質', 'g/kg', { hint: '推奨 1.6〜2.2' })}
        {field('fatPct', '脂質', '%', { hint: '目安 20〜30' })}
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="field-error" role="alert">
          {Object.entries(errors)
            .map(([k, m]) => `${LABELS[k] ?? k}：${raw[k as keyof Fields] == null ? '入力してください' : m}`)
            .join(' ／ ')}
        </div>
      )}

      <div className="plan-result" aria-live="polite">
        {!weightOk ? (
          <p className="muted" style={{ margin: 0 }}>
            体重（{LIMITS.weightKg.min}〜{LIMITS.weightKg.max}kg）を入力すると計算します。
          </p>
        ) : plan == null ? (
          <p className="muted" style={{ margin: 0 }}>
            入力内容を確認してください。
          </p>
        ) : !plan.ok ? (
          <p className="muted" style={{ margin: 0 }}>
            性別・生年月日・身長を入力するか、基礎代謝を入力すると計算します。
          </p>
        ) : (
          <>
            <h3>計算結果（目安）</h3>
            <ol className="plan-steps">
              <li>
                <span className="ps-label">基礎代謝</span>
                <strong>{n(plan.bmr)} kcal</strong>
                <span className="ps-how">
                  {plan.bmrSource === 'input'
                    ? '入力した値'
                    : `Mifflin-St Jeor式（${sexLabel}）：10×${w} ＋ 6.25×${raw.heightCm} − 5×${age} ${raw.sex === 'female' ? '− 161' : '＋ 5'}`}
                </span>
              </li>
              <li>
                <span className="ps-label">1日の消費</span>
                <strong>{n(plan.tdee)} kcal</strong>
                <span className="ps-how">
                  基礎代謝 × 活動係数 {raw.activityLevel as number}
                </span>
              </li>
              <li>
                <span className="ps-label">目標カロリー</span>
                <strong>{n(plan.targetKcal)} kcal</strong>
                <span className="ps-how">
                  {raw.deficitPct === 0
                    ? '消費と同じ（維持）'
                    : `消費 − ${raw.deficitPct as number}%（${n(plan.tdee - plan.targetKcal)} kcal 減らす）`}
                </span>
              </li>
            </ol>
            <table className="data plan-pfc">
              <thead>
                <tr>
                  <th>栄養素</th>
                  <th>量</th>
                  <th>kcal</th>
                  <th className="ps-how-col">計算</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>P（たんぱく質）</td>
                  <td>{plan.proteinG} g</td>
                  <td>{n(plan.proteinG * 4)}</td>
                  <td className="ps-how-col">
                    体重 {w}kg × {raw.proteinPerKg as number}g
                  </td>
                </tr>
                <tr>
                  <td>F（脂質）</td>
                  <td>{plan.fatG} g</td>
                  <td>{n(plan.fatG * 9)}</td>
                  <td className="ps-how-col">
                    目標 × {raw.fatPct as number}% ÷ 9
                  </td>
                </tr>
                <tr>
                  <td>C（炭水化物）</td>
                  <td>{plan.carbsG} g</td>
                  <td>{n(plan.carbsG * 4)}</td>
                  <td className="ps-how-col">残りのカロリー ÷ 4</td>
                </tr>
              </tbody>
            </table>
            {plan.warnings.map((code) =>
              code === 'MISSING_PROFILE' ? null : (
                <div key={code} className="notice" role="note">
                  <span className="icon" aria-hidden>
                    !
                  </span>
                  <span>{WARNING_TEXT[code]}</span>
                </div>
              ),
            )}
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => onApply({ kcal: plan.targetKcal, proteinG: plan.proteinG, fatG: plan.fatG, carbsG: plan.carbsG })}
              >
                この値を目標に入れる
              </button>
              <span className="small muted">目標の欄に入ります。確認・修正してから保存してください。</span>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              これは一般的な式による目安です。2〜3週間ごとに体重の7日平均の変化を見て、週0.5〜1%のペースで減っているか確認し、必要なら目標を見直してください。
              筋肉を残すため、−20% より大きく減らすことはおすすめしません。
            </p>
          </>
        )}
      </div>
      {save.error && <div className="field-error">{save.error.message}</div>}
    </div>
  );
}
