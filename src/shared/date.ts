// 日付はすべてローカル日付の文字列 YYYY-MM-DD で扱う。
// toISOString() は UTC になり日付がずれるため使わない。

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = parse(s);
  return format(d) === s;
}

function parse(s: string): Date {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`不正な日付: ${s}`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function format(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(now: Date = new Date()): string {
  return format(now);
}

export function addDays(date: string, n: number): string {
  const d = parse(date);
  d.setDate(d.getDate() + n);
  return format(d);
}

/** b − a の日数 */
export function diffDays(a: string, b: string): number {
  const ms = parse(b).getTime() - parse(a).getTime();
  // 夏時間などの影響を受けないよう丸める
  return Math.round(ms / 86_400_000);
}

/** from〜to（両端含む）の日付一覧 */
export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** その週の月曜日 */
export function weekStart(date: string): string {
  const dow = parse(date).getDay(); // 0=日
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** date 時点の満年齢 */
export function ageOn(birthDate: string, date: string): number {
  const b = parse(birthDate);
  const d = parse(date);
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) {
    age -= 1;
  }
  return age;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** "11/8 (日)" */
export function formatJa(date: string): string {
  const d = parse(date);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

/** "2026/11/8 (日)" */
export function formatJaLong(date: string): string {
  const d = parse(date);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

/** "11/8" */
export function formatShort(date: string): string {
  const d = parse(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
