import { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { useBackups, useCreateBackup, useImportData } from '../api/hooks';
import { ErrorNotice, useFeedback } from './Feedback';

type Counts = { bodyLogs: number; foods: number; mealEntries: number; goals: number };

const countsText = (c: Counts) => `体組成 ${c.bodyLogs}件・マイ食品 ${c.foods}件・食事 ${c.mealEntries}品・目標 ${c.goals}件`;

/** ファイルの中身をざっと確認して件数を返す（詳しい検証はサーバーで行う） */
function peek(data: unknown): Counts | string {
  if (typeof data !== 'object' || data == null || (data as { app?: unknown }).app !== 'power') {
    return 'Power でエクスポートしたファイルではありません。';
  }
  const d = data as Record<string, unknown>;
  const len = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).length : NaN);
  const c = { bodyLogs: len('bodyLogs'), foods: len('foods'), mealEntries: len('mealEntries'), goals: len('goals') };
  return Object.values(c).some(Number.isNaN) ? 'ファイルの形式が正しくありません。' : c;
}

/** データ：エクスポート・インポート・バックアップ */
export function DataManagement({ onImported }: { onImported: () => void }) {
  const backups = useBackups();
  const create = useCreateBackup();
  const imp = useImportData();
  const { toast } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const latest = backups.data?.find((b) => !b.file.includes('pre-import')) ?? backups.data?.[0];

  async function onFile(file: File) {
    setImportError(null);
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setImportError('JSON ファイルとして読み込めませんでした。');
      return;
    }
    const c = peek(data);
    if (typeof c === 'string') {
      setImportError(c);
      return;
    }
    const at = (data as { exportedAt?: string }).exportedAt;
    const when = at ? `（${new Date(at).toLocaleString('ja-JP')} に書き出し）` : '';
    if (
      !window.confirm(
        `「${file.name}」${when}\n${countsText(c)}\n\n現在のデータはすべてこのファイルの内容に置き換えられます（事前に自動でバックアップします）。読み込みますか？`,
      )
    ) {
      return;
    }
    try {
      const r = await imp.mutateAsync(data);
      onImported();
      toast(`読み込みました：${countsText(r.imported)}`);
    } catch (e) {
      if (e instanceof ApiError && e.details.length) {
        const list = e.details.slice(0, 3).map((d) => `${d.path}：${d.message}`);
        const more = e.details.length > 3 ? ` ほか${e.details.length - 3}件` : '';
        setImportError(`ファイルの内容に問題があるため、何も変更していません。（${list.join(' ／ ')}${more}）`);
      } else {
        setImportError(e instanceof Error ? e.message : String(e));
      }
    }
  }

  return (
    <div className="card stack">
      <h2 style={{ margin: 0 }}>データ</h2>
      <p className="small secondary" style={{ margin: 0 }}>
        データは PC 内の <code>data/power.db</code> に保存されています。起動するたびに 1 日 1 回、<code>data/backups/</code>{' '}
        に自動でバックアップします（30日分を保持）。
      </p>

      <div className="data-actions">
        <div className="data-action">
          <a className="button" href="/api/export" download>
            エクスポート
          </a>
          <span className="small muted">全データを JSON ファイルに書き出します（PC の移行や控えに）。</span>
        </div>
        <div className="data-action">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={imp.isPending}>
            {imp.isPending ? '読み込み中…' : 'インポート…'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="インポートするファイル"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ''; // 同じファイルをもう一度選べるように
              if (file) void onFile(file);
            }}
          />
          <span className="small muted">エクスポートしたファイルから復元します。現在のデータは置き換えられます。</span>
        </div>
        <div className="data-action">
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
      </div>
      {importError && (
        <div className="notice error" role="alert">
          <span className="icon" aria-hidden>
            ✕
          </span>
          <span>{importError}</span>
        </div>
      )}
      <ErrorNotice error={create.error ?? backups.error} />
    </div>
  );
}
