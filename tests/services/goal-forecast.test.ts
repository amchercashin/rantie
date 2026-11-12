import { describe, expect, it } from 'vitest';
import {
  FORECAST_HORIZON_MONTHS,
  describeWait,
  forecastYieldPercent,
  goalDate,
  incomePath,
  monthsToGoal,
} from '@/services/goal-forecast';

// The demo portfolio: 46 787 ₽ a month after NDFL at 7,6% net.
const demo = { incomePerMonth: 46_787, yieldPercent: 7.6 };

describe('monthsToGoal', () => {
  it('reinvesting every payout grows the income to the goal by itself', () => {
    // ln(100 000 / 46 787) / ln(1,076) ≈ 10,4 years.
    expect(monthsToGoal({ ...demo, goalPerMonth: 100_000 })).toBe(125);
    expect(monthsToGoal({ ...demo, goalPerMonth: 150_000 })).toBe(191);
  });

  it('monthly top-ups bring the goal closer', () => {
    expect(monthsToGoal({ ...demo, goalPerMonth: 100_000, monthly: 50_000 })).toBe(72);
    expect(monthsToGoal({ ...demo, goalPerMonth: 150_000, monthly: 50_000 })).toBe(119);
  });

  it('a yearly top-up counts at the end of each year, and adds to the monthly one', () => {
    expect(monthsToGoal({ ...demo, goalPerMonth: 100_000, yearly: 200_000 })).toBe(102);
    expect(monthsToGoal({ ...demo, goalPerMonth: 100_000, monthly: 50_000, yearly: 200_000 })).toBe(64);
  });

  it('is zero once the goal is reached, whatever the yield', () => {
    expect(monthsToGoal({ ...demo, goalPerMonth: 40_000 })).toBe(0);
    expect(monthsToGoal({ incomePerMonth: 50_000, yieldPercent: 0, goalPerMonth: 50_000 })).toBe(0);
  });

  it('never arrives without a positive yield — top-ups would buy no income', () => {
    expect(monthsToGoal({ ...demo, yieldPercent: 0, goalPerMonth: 100_000, monthly: 50_000 })).toBeNull();
    expect(monthsToGoal({ ...demo, yieldPercent: -3, goalPerMonth: 100_000 })).toBeNull();
    expect(monthsToGoal({ ...demo, yieldPercent: Number.NaN, goalPerMonth: 100_000 })).toBeNull();
  });

  it('gives up after fifty years', () => {
    expect(monthsToGoal({ incomePerMonth: 10_000, yieldPercent: 1, goalPerMonth: 1_000_000 })).toBeNull();
  });

  it('starts from nothing only with top-ups', () => {
    expect(monthsToGoal({ incomePerMonth: 0, yieldPercent: 8, goalPerMonth: 10_000 })).toBeNull();
    expect(monthsToGoal({ incomePerMonth: 0, yieldPercent: 8, goalPerMonth: 10_000, monthly: 30_000 })).not.toBeNull();
  });
});

describe('incomePath', () => {
  it('starts at today’s income and grows by the yield in a year when reinvested', () => {
    const path = incomePath({ ...demo, months: 24 });
    expect(path).toHaveLength(25);
    expect(path[0]).toBe(46_787);
    expect(path[12]).toBeCloseTo(46_787 * 1.076, 6);
    expect(path[24]).toBeCloseTo(46_787 * 1.076 ** 2, 6);
  });

  it('adds the yearly top-up only at the turn of each year', () => {
    const plain = incomePath({ ...demo, months: 13 });
    const withYearly = incomePath({ ...demo, months: 13, yearly: 120_000 });
    expect(withYearly[11]).toBe(plain[11]);
    expect(withYearly[12]).toBeGreaterThan(plain[12]);
  });

  it('stays flat at zero yield', () => {
    expect(new Set(incomePath({ ...demo, yieldPercent: 0, months: 6, monthly: 10_000 }))).toEqual(new Set([46_787]));
  });

  it('is capped at the horizon', () => {
    expect(incomePath({ ...demo, months: 10_000 })).toHaveLength(FORECAST_HORIZON_MONTHS + 1);
  });
});

describe('forecastYieldPercent', () => {
  it('takes the yield of the assets whose value is known, so rent without a price does not inflate it', () => {
    expect(
      forecastYieldPercent([
        { value: 1_000_000, incomePerYear: 100_000 },
        { value: 0, incomePerYear: 504_000 },
      ]),
    ).toBeCloseTo(10, 9);
  });

  it('is null when no value is known at all', () => {
    expect(forecastYieldPercent([{ value: 0, incomePerYear: 504_000 }])).toBeNull();
    expect(forecastYieldPercent([])).toBeNull();
  });
});

describe('goalDate and describeWait', () => {
  it('counts months from today', () => {
    const now = new Date(2026, 10, 12, 12);
    expect(goalDate(125, now).getFullYear()).toBe(2037);
    expect(goalDate(1, now).getFullYear()).toBe(2026);
    expect(goalDate(2, now).getFullYear()).toBe(2027);
  });

  it('speaks in months up to a year and a half, then in round years', () => {
    expect(describeWait(1)).toBe('через 1 месяц');
    expect(describeWait(8)).toBe('через 8 месяцев');
    expect(describeWait(17)).toBe('через 17 месяцев');
    expect(describeWait(18)).toBe('примерно через 2 года');
    expect(describeWait(125)).toBe('примерно через 10 лет');
    expect(describeWait(191)).toBe('примерно через 16 лет');
    expect(describeWait(253)).toBe('примерно через 21 год');
  });
});
