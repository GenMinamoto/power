import { today } from '../../shared/date';
import { api } from '../api/client';

// スマホ版のエクスポート。共有シート（「ファイルに保存」で iCloud Drive などへ）か、ダウンロードで書き出す。

const LAST_EXPORT_KEY = 'power.lastExportAt';

export function lastExportAt(): Date | null {
  try {
    const v = localStorage.getItem(LAST_EXPORT_KEY);
    return v ? new Date(v) : null;
  } catch {
    return null;
  }
}

function markExported(): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  } catch {
    // 記録できなくてもエクスポート自体は成功している
  }
}

/** 最後のエクスポートから何日たったか。一度もなければ null */
export function daysSinceExport(now = new Date()): number | null {
  const at = lastExportAt();
  return at ? Math.floor((now.getTime() - at.getTime()) / 86_400_000) : null;
}

/** 書き出したら true、共有シートを閉じて取りやめたら false */
export async function exportToFile(): Promise<boolean> {
  const data = await api<unknown>('/api/export');
  const name = `power-export-${today().replaceAll('-', '')}.json`;
  const file = new File([JSON.stringify(data, null, 2)], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      markExported();
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // 共有できない状況（NotAllowedError など）はダウンロードに切り替える
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markExported();
  return true;
}
