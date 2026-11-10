import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { getIncomeGoal, goalProgress, setIncomeGoal } from '@/services/income-goal';
import { exportAllData, importAllData } from '@/services/backup';

describe('income goal storage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('is null until the user sets it', async () => {
    expect(await getIncomeGoal()).toBeNull();
  });

  it('stores a monthly amount in whole rubles', async () => {
    await setIncomeGoal(150_000.4);
    expect(await getIncomeGoal()).toBe(150_000);
  });

  it('removes the goal on null, zero or garbage', async () => {
    await setIncomeGoal(100_000);
    await setIncomeGoal(null);
    expect(await getIncomeGoal()).toBeNull();

    await setIncomeGoal(100_000);
    await setIncomeGoal(0);
    expect(await getIncomeGoal()).toBeNull();

    await setIncomeGoal(100_000);
    await setIncomeGoal(Number.NaN);
    expect(await getIncomeGoal()).toBeNull();
  });

  it('ignores a broken stored value', async () => {
    await db.table('settings').put({ key: 'income-goal-month', value: 'abc' });
    expect(await getIncomeGoal()).toBeNull();
  });

  it('travels with the backup', async () => {
    await setIncomeGoal(120_000);
    const json = await exportAllData();
    await setIncomeGoal(null);
    await importAllData(json);
    expect(await getIncomeGoal()).toBe(120_000);
  });
});

describe('goalProgress', () => {
  it('tells a month as days paid for', () => {
    const p = goalProgress(46_819, 150_000, 'month');
    expect(p.percent).toBe(31);
    expect(p.cells).toBe(30);
    expect(p.covered).toBeCloseTo(9.36, 1);
    expect(p.coveredLabel).toBe('9 дней из 30');
    expect(p.reached).toBe(false);
  });

  it('tells a year as months paid for — same share of the way', () => {
    const p = goalProgress(46_819, 150_000, 'year');
    expect(p.percent).toBe(31);
    expect(p.cells).toBe(12);
    expect(p.coveredLabel).toBe('3 месяца из 12');
  });

  it('declines Russian numerals', () => {
    expect(goalProgress(1, 30, 'month').coveredLabel).toBe('1 день из 30');
    expect(goalProgress(2, 30, 'month').coveredLabel).toBe('2 дня из 30');
    expect(goalProgress(21, 30, 'month').coveredLabel).toBe('21 день из 30');
    expect(goalProgress(1, 12, 'year').coveredLabel).toBe('1 месяц из 12');
    expect(goalProgress(5, 12, 'year').coveredLabel).toBe('5 месяцев из 12');
  });

  it('never shows 0% once there is income, nor 100% before the goal', () => {
    const tiny = goalProgress(100, 1_000_000, 'month');
    expect(tiny.percent).toBe(1);
    expect(tiny.coveredLabel).toBe('меньше дня');

    const almost = goalProgress(99_999, 100_000, 'month');
    expect(almost.percent).toBe(99);
    expect(almost.reached).toBe(false);
    expect(almost.coveredLabel).toBe('29 дней из 30');
  });

  it('caps the strip at the goal but keeps the real percent', () => {
    const p = goalProgress(46_819, 40_000, 'month');
    expect(p.reached).toBe(true);
    expect(p.percent).toBe(117);
    expect(p.covered).toBe(30);
    expect(p.coveredLabel).toBe('весь месяц');
    expect(goalProgress(46_819, 40_000, 'year').coveredLabel).toBe('весь год');
  });

  it('is exactly reached at 100%', () => {
    const p = goalProgress(100_000, 100_000, 'month');
    expect(p.reached).toBe(true);
    expect(p.percent).toBe(100);
  });

  it('handles no income', () => {
    const p = goalProgress(0, 100_000, 'month');
    expect(p.percent).toBe(0);
    expect(p.covered).toBe(0);
    expect(p.coveredLabel).toBe('0 дней из 30');
  });
});
