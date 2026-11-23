import { useState, type FormEvent } from 'react';
import { WORKOUT_KINDS, WORKOUT_LABELS, type WorkoutKind } from '../../shared/constants';
import { formatShort, today } from '../../shared/date';
import { parseHealthText, SHORTCUT_NAME, type HealthParseResult } from '../../shared/healthText';
import { workoutInputSchema, type HealthWorkoutInput, type WorkoutInput } from '../../shared/schemas';
import type { Workout, WorkoutBonus } from '../../shared/types';
import { useAddWorkout, useDeleteWorkout, useImportHealthWorkouts, useUpdateWorkout, useWorkouts } from '../api/hooks';
import { IS_MOBILE } from '../platform';
import { fmtG, parseNum } from '../utils/num';
import { ErrorNotice, useFeedback } from './Feedback';

const SHORTCUT_GUIDE_URL = 'https://github.com/GenMinamoto/power/blob/main/docs/health-shortcut.md';

type Fields = { kind: WorkoutKind; name: string; durationMin: string; distanceKm: string; kcal: string };

const EMPTY: Fields = { kind: 'run', name: WORKOUT_LABELS.run, durationMin: '', distanceKm: '', kcal: '' };

const fromWorkout = (w: Workout): Fields => ({
  kind: w.kind,
  name: w.name,
  durationMin: w.durationMin == null ? '' : String(w.durationMin),
  distanceKm: w.distanceKm == null ? '' : String(w.distanceKm),
  kcal: String(w.kcal),
});

/** 「30分・5.2km」のような説明 */
export function workoutDetail(w: { durationMin: number | null; distanceKm: number | null }): string {
  return [w.durationMin != null ? `${Math.round(w.durationMin)}分` : null, w.distanceKm != null ? `${fmtG(w.distanceKm)}km` : null]
    .filter(Boolean)
    .join('・');
}

/** 運動 1 件の入力（追加・編集で共用）。消費カロリーを空欄にすると、体重・時間・距離から目安を計算する */
function WorkoutForm({
  date,
  workout,
  idPrefix,
  onSubmit,
  onCancel,
}: {
  date: string;
  workout?: Workout;
  idPrefix: string;
  onSubmit: (input: WorkoutInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<Fields>(() => (workout ? fromWorkout(workout) : EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // 名前が種目名のままなら、種目を変えたときに名前も合わせる
  const nameIsDefault = WORKOUT_KINDS.some((k) => WORKOUT_LABELS[k] === f.name) || f.name === '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const raw = {
      date,
      kind: f.kind,
      name: f.name,
      durationMin: parseNum(f.durationMin),
      distanceKm: parseNum(f.distanceKm),
      kcal: parseNum(f.kcal),
      memo: workout?.memo ?? null,
    };
    const parsed = workoutInputSchema.safeParse(raw);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setServerError(null);
    setBusy(true);
    try {
      await onSubmit(parsed.data);
      if (!workout) setF({ ...EMPTY, kind: f.kind, name: nameIsDefault ? WORKOUT_LABELS[f.kind] : f.name });
    } catch (err) {
      setServerError(err);
    } finally {
      setBusy(false);
    }
  }

  const field = (k: 'durationMin' | 'distanceKm' | 'kcal', label: string, placeholder = '') => (
    <div className={`mf-field wf-${k}`}>
      <label htmlFor={`${idPrefix}-${k}`}>{label}</label>
      <input
        id={`${idPrefix}-${k}`}
        inputMode="decimal"
        value={f[k]}
        placeholder={placeholder}
        aria-invalid={errors[k] ? true : undefined}
        onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <form className={`workout-form${workout ? ' editing' : ''}`} onSubmit={submit} aria-label={workout ? '運動を編集' : '運動を追加'}>
      <div className="mf-field wf-kind">
        <label htmlFor={`${idPrefix}-kind`}>種目</label>
        <select
          id={`${idPrefix}-kind`}
          value={f.kind}
          onChange={(e) => {
            const kind = e.target.value as WorkoutKind;
            setF((s) => ({ ...s, kind, name: nameIsDefault ? WORKOUT_LABELS[kind] : s.name }));
          }}
        >
          {WORKOUT_KINDS.map((k) => (
            <option key={k} value={k}>
              {WORKOUT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="mf-field wf-name">
        <label htmlFor={`${idPrefix}-name`}>名前</label>
        <input
          id={`${idPrefix}-name`}
          value={f.name}
          aria-invalid={errors.name ? true : undefined}
          onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))}
        />
      </div>
      {field('durationMin', '時間（分）')}
      {field('distanceKm', '距離（km）')}
      {field('kcal', '消費（kcal）', '自動')}
      <div className="mf-actions">
        <button type="submit" className={workout ? 'primary' : undefined} disabled={busy}>
          {workout ? '保存' : '追加'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
        )}
      </div>
      {Object.keys(errors).length > 0 && (
        <div className="mf-errors field-error" role="alert">
          {Object.values(errors).join(' ／ ')}
        </div>
      )}
      {serverError != null && (
        <div className="mf-errors field-error" role="alert">
          {(serverError as Error).message}
        </div>
      )}
    </form>
  );
}

function WorkoutRow({ w }: { w: Workout }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateWorkout();
  const del = useDeleteWorkout();
  const { toast } = useFeedback();

  if (editing) {
    return (
      <li className="meal-row editing">
        <WorkoutForm
          date={w.date}
          workout={w}
          idPrefix={`wedit-${w.id}`}
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await update.mutateAsync({ id: w.id, input });
            setEditing(false);
            toast('保存しました');
          }}
        />
      </li>
    );
  }
  const detail = workoutDetail(w);
  return (
    <li className="meal-row workout-row">
      <span className="mr-name">
        {w.name}
        {w.source === 'health' && <span className="badge">ヘルスケア</span>}
        {detail && <span className="muted small"> {detail}</span>}
      </span>
      <span className="mr-kcal">
        {w.kcal.toLocaleString()}
        <span className="unit">kcal</span>
      </span>
      <span className="mr-actions">
        <button type="button" className="small-btn" onClick={() => setEditing(true)} aria-label={`${w.name}を編集`}>
          編集
        </button>
        <button
          type="button"
          className="small-btn danger"
          aria-label={`${w.name}を削除`}
          onClick={async () => {
            if (!window.confirm(`「${w.name}」を削除しますか？`)) return;
            await del.mutateAsync(w.id);
            toast('削除しました');
          }}
        >
          削除
        </button>
      </span>
    </li>
  );
}

/** 運動による上乗せの説明（記録画面・ホームで共用） */
export function BonusNote({ bonus }: { bonus: WorkoutBonus }) {
  if (bonus.workoutKcal === 0) return null;
  return (
    <p className="small secondary bonus-note">
      運動 {bonus.workoutKcal.toLocaleString()}kcal → 目標に <strong>+{bonus.bonusKcal.toLocaleString()}kcal</strong>（炭水化物 +
      {bonus.bonusCarbsG}g）
      <span className="muted">
        {bonus.deficitPct > 0 ? `　※ 減量ペース −${bonus.deficitPct}% を当てはめた分` : ''}
      </span>
    </p>
  );
}

/** ヘルスケア（iPhone のショートカット経由）からの取り込み */
function HealthImport({ date }: { date: string }) {
  const save = useImportHealthWorkouts();
  const { toast } = useFeedback();
  const [result, setResult] = useState<HealthParseResult | null>(null);
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');

  const read = (t: string) => setResult(parseHealthText(t, today()));

  async function fromClipboard() {
    try {
      read(await navigator.clipboard.readText());
    } catch {
      // 読み取りを許可されなかったとき（PC のブラウザなど）は、貼り付け欄を出す
      setManual(true);
    }
  }

  async function commit(items: HealthWorkoutInput[]) {
    const r = await save.mutateAsync(items);
    setResult(null);
    setText('');
    setManual(false);
    toast(r.replaced ? `取り込みました（${r.replaced}件は前回の取り込みを上書き）` : '取り込みました');
  }

  return (
    <div className="health-import">
      <div className="row">
        <strong className="small">ヘルスケアから取り込む</strong>
        <span className="spacer" />
        {IS_MOBILE && (
          <a className="button small-btn" href={`shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`}>
            ① ショートカットを実行
          </a>
        )}
        <button type="button" className="small-btn" onClick={fromClipboard}>
          {IS_MOBILE ? '② コピーした内容を取り込む' : 'コピーした内容を取り込む'}
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        iPhone の「ショートカット」で、Runkeeper などがヘルスケアに書き込んだ消費カロリーを集めてコピーし、ここで取り込みます。
        同じ日の同じ種目は上書きされるので、何度取り込んでも二重になりません。{' '}
        <a href={SHORTCUT_GUIDE_URL} target="_blank" rel="noopener noreferrer">
          ショートカットの作り方
        </a>
        {!manual && (
          <>
            {' '}
            <button type="button" className="link-btn" onClick={() => setManual(true)}>
              手で貼り付ける
            </button>
          </>
        )}
      </p>
      {manual && (
        <div className="health-paste">
          <label htmlFor={`health-text-${date}`} className="small secondary">
            コピーした内容を貼り付け
          </label>
          <textarea
            id={`health-text-${date}`}
            rows={2}
            value={text}
            placeholder="power date=2026-11-23 kind=run kcal=350 km=5.2 min=32"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row">
            <button type="button" className="small-btn" onClick={() => read(text)} disabled={!text.trim()}>
              読み取る
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="health-preview" role="region" aria-label="取り込む内容">
          {result.errors.map((e) => (
            <div key={e} className="field-error">
              {e}
            </div>
          ))}
          {result.empty.length > 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              {result.empty.map(formatShort).join('、')} は運動の記録がありませんでした。
            </p>
          )}
          {result.items.length > 0 && (
            <>
              <ul>
                {result.items.map((i) => (
                  <li key={`${i.date}-${i.kind}-${i.name}`}>
                    {formatShort(i.date)} {i.name} <strong>{Math.round(i.kcal).toLocaleString()}kcal</strong>{' '}
                    <span className="muted">{workoutDetail(i)}</span>
                  </li>
                ))}
              </ul>
              <div className="row">
                <button type="button" className="primary small-btn" disabled={save.isPending} onClick={() => commit(result.items)}>
                  この内容で保存
                </button>
                <button type="button" className="small-btn" onClick={() => setResult(null)}>
                  やめる
                </button>
              </div>
            </>
          )}
          <ErrorNotice error={save.error} />
        </div>
      )}
    </div>
  );
}

/** 記録画面の「運動」 */
export function WorkoutCard({ date }: { date: string }) {
  const workouts = useWorkouts(date);
  const add = useAddWorkout();
  const { toast } = useFeedback();
  const d = workouts.data;

  return (
    <div className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>運動</h2>
        {d && d.bonus.workoutKcal > 0 && (
          <span className="small secondary">
            合計 <strong>{d.bonus.workoutKcal.toLocaleString()}</strong>kcal
          </span>
        )}
      </div>
      <ErrorNotice error={workouts.error} />
      {d && d.entries.length > 0 && (
        <ul className="meal-list">
          {d.entries.map((w) => (
            <WorkoutRow key={w.id} w={w} />
          ))}
        </ul>
      )}
      <WorkoutForm
        key={date}
        date={date}
        idPrefix="wadd"
        onSubmit={async (input) => {
          await add.mutateAsync(input);
          toast('追加しました');
        }}
      />
      <p className="small muted" style={{ margin: 0 }}>
        消費を空欄にすると、体重と時間・距離から目安を計算します（ランニング：体重×距離、筋トレ：時間から）。
      </p>
      {d && <BonusNote bonus={d.bonus} />}
      <HealthImport date={date} />
    </div>
  );
}
