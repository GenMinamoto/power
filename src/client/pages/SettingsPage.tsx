import { useBackups, useCreateBackup } from '../api/hooks';
import { ErrorNotice, useFeedback } from '../components/Feedback';

export function SettingsPage() {
  const backups = useBackups();
  const create = useCreateBackup();
  const { toast } = useFeedback();
  const latest = backups.data?.[0];

  return (
    <div className="stack">
      <h1>目標・設定</h1>
      <div className="card">
        <h2>目標・目安計算</h2>
        <p className="muted small" style={{ margin: 0 }}>
          プロフィール・目安計算・目標設定はフェーズ4で追加します。
        </p>
      </div>
      <div className="card stack">
        <h2>データ</h2>
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
    </div>
  );
}
