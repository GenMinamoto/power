import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../api/client';
import { useBackups, useCreateBackup, useImportData, useRestoreBackup } from '../api/hooks';
import { IS_MOBILE } from '../platform';
import { daysSinceExport, exportToFile, lastExportAt } from '../utils/exportFile';
import { ErrorNotice, useFeedback, WarningNotice } from './Feedback';

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exportedAt, setExportedAt] = useState(lastExportAt);
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
      {IS_MOBILE ? (
        <p className="small secondary" style={{ margin: 0 }}>
          データはこのスマホの中（Power 専用の保存場所）にだけ保存され、外部には送信しません。開くたびに 1 日 1
          回、スマホの中に自動でバックアップします（30日分を保持）。
          <br />
          スマホの故障・紛失や、ブラウザのデータ削除に備えて、<strong>ときどき「エクスポート」で iCloud Drive などに保存</strong>
          してください。
        </p>
      ) : (
        <p className="small secondary" style={{ margin: 0 }}>
          データは PC 内の <code>data/power.db</code> に保存されています。起動するたびに 1 日 1 回、<code>data/backups/</code>{' '}
          に自動でバックアップします（30日分を保持）。
        </p>
      )}

      <div className="data-actions">
        {IS_MOBILE ? (
          <div className="data-action">
            <button
              type="button"
              disabled={exporting}
              onClick={async () => {
                setExportError(null);
                setExporting(true);
                try {
                  if (await exportToFile()) {
                    setExportedAt(lastExportAt());
                    toast('書き出しました');
                  }
                } catch (e) {
                  setExportError(e);
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? '書き出し中…' : 'エクスポート'}
            </button>
            <span className="small muted">
              全データを JSON ファイルに書き出します。共有メニューの「ファイルに保存」で iCloud Drive などへ。
              <br />
              {exportedAt ? `最終エクスポート：${exportedAt.toLocaleString('ja-JP')}` : 'まだエクスポートしていません'}
            </span>
          </div>
        ) : (
          <div className="data-action">
            <a className="button" href="/api/export" download>
              エクスポート
            </a>
            <span className="small muted">全データを JSON ファイルに書き出します（PC の移行や控えに）。</span>
          </div>
        )}
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
      <ErrorNotice error={exportError ?? create.error ?? backups.error} />
      {IS_MOBILE && backups.data && backups.data.length > 0 && <RestoreList onRestored={onImported} />}
    </div>
  );
}

/** スマホ版：端末内のバックアップの一覧と復元 */
function RestoreList({ onRestored }: { onRestored: () => void }) {
  const backups = useBackups();
  const restore = useRestoreBackup();
  const { toast } = useFeedback();

  return (
    <details className="restore-list">
      <summary>スマホ内のバックアップから戻す（{backups.data?.length ?? 0}件）</summary>
      <p className="small muted">
        選んだ時点の状態に戻します。戻す直前の状態も自動でバックアップするので、やり直せます。
      </p>
      <ul>
        {backups.data?.map((b) => (
          <li key={b.file}>
            <span>
              {new Date(b.createdAt).toLocaleString('ja-JP')}
              {b.file.includes('pre-import') && <span className="badge">読み込み・復元の直前</span>}
            </span>
            <button
              type="button"
              disabled={restore.isPending}
              onClick={async () => {
                const when = new Date(b.createdAt).toLocaleString('ja-JP');
                if (!window.confirm(`${when} の状態に戻します。現在のデータは置き換えられます（事前に自動でバックアップします）。よろしいですか？`)) return;
                await restore.mutateAsync(b.file);
                onRestored();
                toast(`${when} の状態に戻しました`);
              }}
            >
              この時点に戻す
            </button>
          </li>
        ))}
      </ul>
      <ErrorNotice error={restore.error} />
    </details>
  );
}

/** スマホ版のホーム：しばらくエクスポートしていなければ知らせる */
function MobileExportReminder() {
  const backups = useBackups();
  const days = daysSinceExport();
  // 何日か使ってから（バックアップができてから）知らせる
  if (!backups.data?.length || (days != null && days < 7)) return null;
  return (
    <WarningNotice>
      {days == null ? 'まだ一度もエクスポートしていません。' : `最後のエクスポートから${days}日たちました。`}
      スマホの故障や紛失に備えて、<Link to="/settings">目標・設定</Link>の「エクスポート」で iCloud Drive
      などに保存しておきましょう。
    </WarningNotice>
  );
}

export const ExportReminder = IS_MOBILE ? MobileExportReminder : () => null;
