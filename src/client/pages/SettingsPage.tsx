import { useRef } from 'react';
import { today } from '../../shared/date';
import { useBackups, useCreateBackup, useDashboard, useGoals, useProfile } from '../api/hooks';
import { ErrorNotice, useFeedback } from '../components/Feedback';
import { GoalForm, GoalHistory, type GoalFormHandle } from '../components/GoalEditor';
import { PlanCalculator } from '../components/PlanCalculator';

function DataCard() {
  const backups = useBackups();
  const create = useCreateBackup();
  const { toast } = useFeedback();
  const latest = backups.data?.[0];

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>データ</h2>
      <p className="small secondary" style={{ margin: 0 }}>
        データは PC 内の <code>data/power.db</code> に保存されています。起動するたびに 1 日 1 回、<code>data/backups/</code>{' '}
        に自動でバックアップします（30日分を保持）。
      </p>
      <div className="row">
        <button
          type="button"
          onClick={async () => {
            const r = await create.mutateAsync();
            toast(`バックアップしました：${r.file}`);
          }}
          disabled={create.isPending}
        >
          今すぐバックアップ
        </button>
        <span className="small muted">
          {latest ? `最終バックアップ：${new Date(latest.createdAt).toLocaleString('ja-JP')}（${latest.file}）` : 'バックアップはまだありません'}
        </span>
      </div>
      <ErrorNotice error={create.error ?? backups.error} />
      <p className="muted small" style={{ margin: 0 }}>
        エクスポート / インポートはフェーズ5で追加します。
      </p>
    </div>
  );
}

export function SettingsPage() {
  const profile = useProfile();
  const goals = useGoals();
  const dash = useDashboard(today());
  const goalForm = useRef<GoalFormHandle>(null);
  const { toast } = useFeedback();

  const w = dash.data?.weight;
  const latestWeight = w?.latest != null && w.latestDate ? { kg: w.latest, date: w.latestDate } : null;

  return (
    <div className="stack">
      <h1>目標・設定</h1>
      <ErrorNotice error={profile.error ?? goals.error ?? dash.error} />

      <div className="card">
        {profile.data && dash.data ? (
          <PlanCalculator
            profile={profile.data}
            latestWeight={latestWeight}
            onApply={(v) => {
              goalForm.current?.fill(v);
              toast('目標の欄に入れました。確認して保存してください');
            }}
          />
        ) : (
          <p className="muted">読み込み中…</p>
        )}
      </div>

      <div className="card stack">
        <h2 style={{ margin: 0 }}>目標</h2>
        <p className="small muted" style={{ margin: 0 }}>
          ここで保存した値が正式な目標です。記録画面とホームの達成率、グラフの目標線に使われます。
        </p>
        {goals.data ? <GoalForm ref={goalForm} goals={goals.data} /> : <p className="muted">読み込み中…</p>}
        <h3>目標の履歴</h3>
        {goals.data && <GoalHistory goals={goals.data} onEdit={(g) => goalForm.current?.load(g)} />}
      </div>

      <DataCard />
    </div>
  );
}
