import { describe, expect, it } from 'vitest';
import { addDays, ageOn, diffDays, formatJa, isValidDate, rangeDays, today, weekStart } from '../src/shared/date';

describe('date', () => {
  it('today はローカル日付', () => {
    expect(today(new Date(2026, 10, 8, 23, 59))).toBe('2026-11-08');
    expect(today(new Date(2026, 10, 9, 0, 1))).toBe('2026-11-09');
  });

  it('addDays：月末・年末・うるう年', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffDays / rangeDays', () => {
    expect(diffDays('2026-10-27', '2026-11-08')).toBe(12);
    expect(rangeDays('2026-12-30', '2027-01-02')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('weekStart は月曜', () => {
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // 日曜 → 前の月曜
    expect(weekStart('2026-11-09')).toBe('2026-11-09'); // 月曜
    expect(weekStart('2026-11-14')).toBe('2026-11-09'); // 土曜
  });

  it('ageOn：誕生日の前日と当日', () => {
    expect(ageOn('1996-11-09', '2026-11-08')).toBe(29);
    expect(ageOn('1996-11-08', '2026-11-08')).toBe(30);
  });

  it('isValidDate', () => {
    expect(isValidDate('2026-11-08')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026/11/08')).toBe(false);
  });

  it('formatJa', () => {
    expect(formatJa('2026-11-08')).toBe('11/8 (日)');
  });
});
