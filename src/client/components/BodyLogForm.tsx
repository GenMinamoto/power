import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BODY_FAT_REMINDER_DAYS, WEIGHT_JUMP_WARN_KG } from '../../shared/constants';
import { diffDays, formatShort } from '../../shared/date';
import { bodyLogInputSchema } from '../../shared/schemas';
import type { BodyLogDetail } from '../../shared/types';
import { ApiError } from '../api/client';
import { useDeleteBodyLog, useSaveBodyLog } from '../api/hooks';
import { useFeedback, WarningNotice } from './Feedback';

const toNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

export function BodyLogForm({ date, detail }: { date: string; detail: BodyLogDetail }) {
  const { log, previousBodyFat, previousWeight } = detail;
  const [weight, setWeight] = useState('');
  const [fat, setFat] = useState('');
  const [memo, setMemo] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useSaveBodyLog();
  const del = useDeleteBodyLog();
  const { toast } = useFeedback();
  const weightRef = useRef<HTMLInputElement>(null);

  // 日付を切り替えたら、その日の記録で入力欄を埋め直す
  useEffect(() => {
    setWeight(log?.weightKg != null ? String(log.weightKg) : '');
    setFat(log?.bodyFatPct != null ? String(log.bodyFatPct) : '');
    setMemo(log?.memo ?? '');
    setShowMemo(!!log?.memo);
    setErrors({});
    weightRef.current?.focus();
  }, [date, log]);

  const daysSinceFat = previousBodyFat ? diffDays(previousBodyFat.date, date) : null;
  const fatReminder = log?.bodyFatPct == null && (daysSinceFat == null || daysSinceFat >= BODY_FAT_REMINDER_DAYS);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = { weightKg: toNum(weight), bodyFatPct: toNum(fat), memo: memo.trim() || null };
    const parsed = bodyLogInputSchema.safeParse(input);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    const w = parsed.data.weightKg;
    if (w != null && previousWeight && Math.abs(w - previousWeight.weightKg) >= WEIGHT_JUMP_WARN_KG) {
      const ok = window.confirm(
        `前回（${formatShort(previousWeight.date)}：${previousWeight.weightKg}kg）より ${signed(w - previousWeight.weightKg)}kg 変化しています。保存しますか？`,
      );
      if (!ok) return;
    }
    try {
      await save.mutateAsync({ date, input: parsed.data });
      toast('保存しました');
    } catch (err) {
      if (err instanceof ApiError && err.details.length) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      }
    }
  }

  async function onDelete() {
    if (!window.confirm(`${formatShort(date)} の体組成の記録を削除しますか？`)) return;
    await del.mutateAsync(date);
    toast('削除しました');
  }

  // 体脂肪率を測った日：前回の測定からの変化
  const change =
    log?.leanBodyMassKg != null && previousBodyFat?.leanBodyMassKg != null
      ? {
          days: diffDays(previousBodyFat.date, date),
          weight: log.weightKg! - previousBodyFat.weightKg!,
          fat: log.bodyFatPct! - previousBodyFat.bodyFatPct,
          lbm: log.leanBodyMassKg - previousBodyFat.leanBodyMassKg,
          fatMass: log.fatMassKg! - previousBodyFat.fatMassKg!,
        }
      : null;

  return (
    <form className="card stack" onSubmit={onSubmit} noValidate>
      <h2>体組成</h2>
      {fatReminder && (
        <WarningNotice>
          {daysSinceFat == null
            ? '体脂肪率がまだ記録されていません。測ったら入力しましょう。'
            : `前回の体脂肪率の測定から${daysSinceFat}日たちました。今日測りましょう。`}
        </WarningNotice>
      )}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <label className="field">
          体重
          <span className="input-unit">
            <input
              ref={weightRef}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              aria-invalid={!!errors.weightKg}
            />
            kg
          </span>
          {previousWeight && (
            <span className="muted small">
              前回 {previousWeight.weightKg}kg（{formatShort(previousWeight.date)}）
            </span>
          )}
          {errors.weightKg && <span className="field-error">{errors.weightKg}</span>}
        </label>
        <label className="field">
          体脂肪率（2週間に1回）
          <span className="input-unit">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              aria-invalid={!!errors.bodyFatPct}
            />
            %
          </span>
          {previousBodyFat && (
            <span className="muted small">
              前回 {previousBodyFat.bodyFatPct}%（{formatShort(previousBodyFat.date)}）
            </span>
          )}
          {errors.bodyFatPct && <span className="field-error">{errors.bodyFatPct}</span>}
        </label>
      </div>

      {showMemo ? (
        <label className="field">
          メモ
          <input type="text" value={memo} maxLength={500} onChange={(e) => setMemo(e.target.value)} placeholder="例：起床後・トイレ後" />
          {errors.memo && <span className="field-error">{errors.memo}</span>}
        </label>
      ) : (
        <div>
          <button type="button" onClick={() => setShowMemo(true)}>
            ＋ メモ
          </button>
        </div>
      )}

      <div className="row">
        <button type="submit" className="primary" disabled={save.isPending}>
          {save.isPending ? '保存中…' : '保存'}
        </button>
        {log && (
          <button type="button" className="danger" onClick={onDelete} disabled={del.isPending}>
            削除
          </button>
        )}
        {(save.error || del.error) && <span className="field-error">{(save.error ?? del.error)!.message}</span>}
      </div>

      {log?.leanBodyMassKg != null && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row secondary">
            <span>
              除脂肪体重 <strong>{log.leanBodyMassKg}kg</strong>
            </span>
            <span>
              体脂肪量 <strong>{log.fatMassKg}kg</strong>
            </span>
          </div>
          {change && (
            <div className="small secondary">
              前回の測定（{change.days}日前）から：体重 {signed(change.weight)}kg ／ 体脂肪率 {signed(change.fat)}% ／ 除脂肪体重{' '}
              {signed(change.lbm)}kg ／ 体脂肪量 {signed(change.fatMass)}kg
            </div>
          )}
        </div>
      )}
    </form>
  );
}
