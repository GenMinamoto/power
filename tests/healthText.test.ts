import { describe, expect, it } from 'vitest';
import { parseHealthText } from '../src/shared/healthText';

const T = '2026-11-23';

describe('ショートカットがコピーした文字の読み取り', () => {
  it('基本の形', () => {
    expect(parseHealthText('power date=2026-11-22 kind=run kcal=352.4 km=5.2 min=31.5', T)).toEqual({
      items: [{ date: '2026-11-22', kind: 'run', name: 'ランニング（ヘルスケア）', durationMin: 31.5, distanceKm: 5.2, kcal: 352.4 }],
      empty: [],
      errors: [],
    });
  });

  it('日付・種目を省略すると今日のランニング。単位・桁区切り・& 区切りも読める', () => {
    const r = parseHealthText('power&kcal=1,234.5 kcal&km=10.0km', T);
    expect(r.items).toEqual([{ date: T, kind: 'run', name: 'ランニング（ヘルスケア）', durationMin: null, distanceKm: 10, kcal: 1234.5 }]);
  });

  it('前後の余計な行は無視し、複数行は複数件。日付は 2026/11/3 の形も読める', () => {
    const r = parseHealthText('結果：\npower date=2026/11/3 kcal=300\nPOWER kind=walk kcal=80 name=散歩\nおわり', T);
    expect(r.items.map((i) => [i.date, i.kind, i.name, i.kcal])).toEqual([
      ['2026-11-03', 'run', 'ランニング（ヘルスケア）', 300],
      ['2026-11-23', 'walk', '散歩', 80],
    ]);
  });

  it('kcal が 0 の日は「運動なし」。距離・時間の 0 は「なし」', () => {
    const r = parseHealthText('power kcal=0 km=0 min=0\npower kind=strength kcal=150 km=0 min=0', T);
    expect(r.empty).toEqual([T]);
    expect(r.items).toEqual([{ date: T, kind: 'strength', name: '筋トレ（ヘルスケア）', durationMin: null, distanceKm: null, kcal: 150 }]);
  });

  it('読み取れないときは理由を返す', () => {
    expect(parseHealthText('こんにちは', T).errors[0]).toContain('Power 用の内容が見つかりません');
    expect(parseHealthText('power km=5', T).errors).toEqual(['消費カロリー（kcal=）がありません']);
    expect(parseHealthText('power date=2026-02-30 kcal=1\npower kind=swim kcal=1', T).errors).toEqual([
      '1行目：日付「2026-02-30」を読み取れません',
      '2行目：種目「swim」を読み取れません（run / walk / strength / cycle / other）',
    ]);
  });
});
