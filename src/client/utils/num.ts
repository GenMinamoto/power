/** 入力欄の文字列を数値に。空欄は null、数値でなければ NaN（入力チェックでエラーにする） */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/[０-９．]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** 符号付きで小数 1 桁 */
export const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

/** グラム表示：整数ならそのまま、小数があれば 1 桁 */
export const fmtG = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
