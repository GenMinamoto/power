import { useRef, useState } from 'react';
import { today } from '../../shared/date';
import { useDashboard, useGoals, useProfile } from '../api/hooks';
import { DataManagement } from '../components/DataManagement';
import { ErrorNotice, useFeedback } from '../components/Feedback';
import { GoalForm, GoalHistory, type GoalFormHandle } from '../components/GoalEditor';
import { PlanCalculator } from '../components/PlanCalculator';

export function SettingsPage() {
  const profile = useProfile();
  const goals = useGoals();
  const dash = useDashboard(today());
  const goalForm = useRef<GoalFormHandle>(null);
  const { toast } = useFeedback();
  // インポート後は入力欄を読み込んだ内容で作り直す
  const [generation, setGeneration] = useState(0);

  const w = dash.data?.weight;
  const latestWeight = w?.latest != null && w.latestDate ? { kg: w.latest, date: w.latestDate } : null;

  return (
    <div className="stack">
      <h1>目標・設定</h1>
      <ErrorNotice error={profile.error ?? goals.error ?? dash.error} />

      <div className="card">
        {profile.data && dash.data ? (
          <PlanCalculator
            key={generation}
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
        {goals.data ? <GoalForm key={generation} ref={goalForm} goals={goals.data} /> : <p className="muted">読み込み中…</p>}
        <h3>目標の履歴</h3>
        {goals.data && <GoalHistory goals={goals.data} onEdit={(g) => goalForm.current?.load(g)} />}
      </div>

      <DataManagement onImported={() => setGeneration((g) => g + 1)} />
    </div>
  );
}
