import { describe, expect, it } from 'vitest';
import {
  FORECAST_HORIZON_MONTHS,
  capitalPath,
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

describe('capitalPath', () => {
  it('adds every payout reinvested and every top-up to today’s capital', () => {
    const input = { ...demo, monthly: 50_000, yearly: 200_000, months: 13 };
    const income = incomePath(input);
    const capital = capitalPath({ ...input, capital: 7_400_000 });
    expect(capital).toHaveLength(14);
    expect(capital[0]).toBe(7_400_000);
    expect(capital[1]).toBeCloseTo(7_400_000 + income[0] + 50_000, 6);
    expect(capital[12] - capital[11]).toBeCloseTo(income[11] + 50_000 + 200_000, 6);
  });

  it('pays exactly the monthly rate on the capital when today’s income does', () => {
    const r = Math.pow(1.076, 1 / 12) - 1;
    const input = { incomePerMonth: 7_400_000 * r, yieldPercent: 7.6, monthly: 30_000, months: 60 };
    const income = incomePath(input);
    const capital = capitalPath({ ...input, capital: 7_400_000 });
    for (const m of [1, 12, 59, 60]) expect(capital[m] * r).toBeCloseTo(income[m], 6);
  });

  it('grows the capital by the top-ups even when the portfolio pays nothing yet', () => {
    const capital = capitalPath({ incomePerMonth: 0, yieldPercent: 8, capital: 0, monthly: 10_000, months: 2 });
    expect(capital).toEqual([0, 10_000, expect.any(Number)]);
    expect(capital[2]).toBeGreaterThan(20_000);
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
