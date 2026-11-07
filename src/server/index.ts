import { exec } from 'node:child_process';
import { buildApp } from './app.js';
import { BackupService } from './backup.js';
import { openDb } from './db.js';
import { BACKUP_DIR, CLIENT_DIR, DB_PATH } from './paths.js';

const isDev = process.argv.includes('--dev');
const PORT = Number(process.env.PORT ?? 3000);
const HOST = '127.0.0.1'; // 自分の PC からのみアクセス可能

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

async function main(): Promise<void> {
  const db = openDb(DB_PATH);

  try {
    const created = new BackupService(db, BACKUP_DIR).runDaily();
    if (created) console.log(`バックアップを作成しました: data/backups/${created}`);
  } catch (e) {
    // バックアップ失敗でもアプリは起動する
    console.error('自動バックアップに失敗しました:', e);
  }

  const app = await buildApp({ db, backupDir: BACKUP_DIR, clientDir: isDev ? undefined : CLIENT_DIR, logger: true });

  try {
    await app.listen({ host: HOST, port: PORT });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`ポート${PORT}が使用中です。すでに Power を起動していませんか？`);
      process.exit(1);
    }
    throw e;
  }

  const url = `http://localhost:${PORT}`;
  if (isDev) {
    console.log(`API サーバー起動: ${url}（画面は http://localhost:5173 ）`);
  } else {
    console.log(`Power を起動しました: ${url}`);
    console.log('終了するにはこのウィンドウを閉じるか Ctrl+C を押してください。');
    if (!process.env.NO_OPEN) openBrowser(url);
  }

  const shutdown = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
