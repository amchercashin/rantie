import { describe, expect, it } from 'vitest';
import { calculatePortfolioSnapshot } from '@/services/portfolio-calculator';
import type { Asset, PaymentHistory } from '@/models/types';
import type { Holding } from '@/models/account';

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: 1,
    type: 'Акции',
    name: 'Сбер',
    dataSource: 'manual',
    paymentPerUnitSource: 'fact',
    frequencyPerYear: 1,
    frequencySource: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: 1,
    accountId: 1,
    assetId: 1,
    quantity: 10,
    quantitySource: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('portfolio-calculator', () => {
  it('keeps RUB portfolios compatible with previous calculations', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [asset({ id: 1, currentPrice: 100, paymentPerUnit: 12, paymentPerUnitSource: 'manual' })],
      holdings: [holding({ assetId: 1, quantity: 10 })],
      paymentHistory: [],
      ndflRates: new Map(),
      exchangeRates: new Map(),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.portfolio.totalValue).toBe(1000);
    expect(snapshot.portfolio.totalIncomePerMonth).toBe(10);
    expect(snapshot.portfolio.totalIncomePerYear).toBe(120);
    expect(snapshot.portfolio.yieldPercent).toBe(12);
  });

  it('normalizes foreign asset value and income to RUB using manual rates', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [asset({ id: 1, currentPrice: 100, currency: 'USD', paymentPerUnit: 12, paymentPerUnitSource: 'manual' })],
      holdings: [holding({ assetId: 1, quantity: 2 })],
      paymentHistory: [],
      ndflRates: new Map(),
      exchangeRates: new Map([['USD', 90]]),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.portfolio.totalValue).toBe(18_000);
    expect(snapshot.portfolio.totalIncomePerMonth).toBe(180);
    expect(snapshot.assetsById.get(1)?.currency).toBe('USD');
    expect(snapshot.assetsById.get(1)?.rateToRub).toBe(90);
  });

  it('flags a foreign asset whose rate is unknown instead of hiding it as zero', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [
        asset({ id: 1, type: 'Крипта', currentPrice: 3000, currency: 'USD', paymentPerUnit: 40, paymentPerUnitSource: 'manual' }),
        asset({ id: 2, currentPrice: 100, paymentPerUnit: 12, paymentPerUnitSource: 'manual' }),
        asset({ id: 3, type: 'Крипта', currency: 'EUR', paymentPerUnit: 10, paymentPerUnitSource: 'manual' }),
      ],
      holdings: [holding({ id: 1, assetId: 1, quantity: 1 }), holding({ id: 2, assetId: 2, quantity: 10 })],
      paymentHistory: [],
      ndflRates: new Map(),
      exchangeRates: new Map(),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.assetsById.get(1)?.rateMissing).toBe(true);
    expect(snapshot.assetsById.get(2)?.rateMissing).toBe(false);
    // Not held (no holdings) — nothing is lost from the total, so no portfolio-level warning.
    expect(snapshot.missingRates).toEqual(['USD']);
  });

  it('counts a USD crypto asset with a manual monthly income once the rate is known', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [asset({ id: 1, type: 'Крипта', currentPrice: 3000, currency: 'USD', paymentPerUnit: 40, paymentPerUnitSource: 'manual' })],
      holdings: [holding({ assetId: 1, quantity: 1 })],
      paymentHistory: [],
      ndflRates: new Map([[1, 13]]),
      exchangeRates: new Map([['USD', 82.5]]),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.assetsById.get(1)?.rateMissing).toBe(false);
    expect(snapshot.missingRates).toEqual([]);
    expect(snapshot.portfolio.totalIncomePerMonth).toBeCloseTo((40 / 12) * 0.87 * 82.5);
    expect(snapshot.portfolio.totalValue).toBeCloseTo(3000 * 82.5);
  });

  it('counts the income of an asset without a price, but keeps it out of the yield', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [
        asset({ id: 1, currentPrice: 1000, paymentPerUnit: 100, paymentPerUnitSource: 'manual' }),
        asset({ id: 2, type: 'Крипта', paymentPerUnit: 25, paymentPerUnitSource: 'manual' }),
        asset({ id: 3, type: 'Крипта', currentPrice: 500, paymentPerUnit: 20, paymentPerUnitSource: 'manual' }),
      ],
      holdings: [
        holding({ id: 1, assetId: 1, quantity: 1 }),
        holding({ id: 2, assetId: 2, quantity: 2 }),
        holding({ id: 3, assetId: 3, quantity: 1 }),
      ],
      paymentHistory: [],
      ndflRates: new Map(),
      exchangeRates: new Map(),
      now: new Date('2026-04-28'),
    });

    // The income is all there: 100 + 2 × 25 + 20.
    expect(snapshot.portfolio.totalIncomePerYear).toBeCloseTo(170);
    expect(snapshot.portfolio.totalValue).toBe(1500);
    // Yield of the priced assets only: 120 / 1500, not 170 / 1500.
    expect(snapshot.portfolio.yieldPercent).toBeCloseTo(8, 9);

    const crypto = snapshot.categories.find((c) => c.type === 'Крипта');
    expect(crypto?.totalIncomePerYear).toBeCloseTo(70);
    expect(crypto?.totalValue).toBe(500);
    expect(crypto?.yieldPercent).toBeCloseTo(4, 9);

    const unpriced = snapshot.assetsById.get(2);
    expect(unpriced?.incomePerYear).toBeCloseTo(50);
    expect(unpriced?.value).toBe(0);
    expect(unpriced?.portfolioSharePercent).toBe(0);
  });

  it('has no yield when no asset has a price — whether the price is empty or 0', () => {
    const snapshot = calculatePortfolioSnapshot({
      assets: [
        asset({ id: 1, type: 'Крипта', paymentPerUnit: 12, paymentPerUnitSource: 'manual' }),
        asset({ id: 2, type: 'Крипта', currentPrice: 0, paymentPerUnit: 24, paymentPerUnitSource: 'manual' }),
      ],
      holdings: [holding({ id: 1, assetId: 1, quantity: 1 }), holding({ id: 2, assetId: 2, quantity: 1 })],
      paymentHistory: [],
      ndflRates: new Map(),
      exchangeRates: new Map(),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.portfolio.totalIncomePerMonth).toBeCloseTo(3);
    expect(snapshot.portfolio.totalValue).toBe(0);
    expect(snapshot.portfolio.yieldPercent).toBeNull();
    expect(snapshot.categories[0].yieldPercent).toBeNull();
  });

  it('uses fact payments, excludes forecasts, and applies NDFL', () => {
    const history: PaymentHistory[] = [
      { assetId: 1, amount: 10, date: new Date('2026-01-01'), type: 'dividend', dataSource: 'moex' },
      { assetId: 1, amount: 5, date: new Date('2026-03-01'), type: 'dividend', dataSource: 'dohod', isForecast: true },
    ];

    const snapshot = calculatePortfolioSnapshot({
      assets: [asset({ id: 1, currentPrice: 100 })],
      holdings: [holding({ assetId: 1, quantity: 10 })],
      paymentHistory: history,
      ndflRates: new Map([[1, 13]]),
      exchangeRates: new Map(),
      now: new Date('2026-04-28'),
    });

    expect(snapshot.portfolio.totalIncomePerYear).toBeCloseTo(87);
    expect(snapshot.portfolio.totalIncomePerMonth).toBeCloseTo(7.25);
  });
  describe('NDFL rate of the account', () => {
    const base = {
      assets: [asset({ id: 1, currentPrice: 100, paymentPerUnit: 12, paymentPerUnitSource: 'manual' as const })],
      paymentHistory: [],
      exchangeRates: new Map<string, number>(),
      now: new Date('2026-04-28'),
    };

    it('taxes each holding at its account rate, averaged by quantity', () => {
      const snapshot = calculatePortfolioSnapshot({
        ...base,
        holdings: [holding({ id: 1, accountId: 1, quantity: 40 }), holding({ id: 2, accountId: 2, quantity: 10 })],
        ndflRates: new Map([[1, 13], [2, 0]]),
      });

      // 40 × 12 × 0.87 + 10 × 12 = 537.6 a year
      expect(snapshot.portfolio.totalIncomePerYear).toBeCloseTo(537.6);
      const stats = snapshot.assetsById.get(1)!;
      expect(stats.taxMultiplier).toBeCloseTo(0.896);
      expect(stats.taxed).toBe(true);
    });

    it('an account at 0% makes its income gross, and every level says so', () => {
      const snapshot = calculatePortfolioSnapshot({
        ...base,
        holdings: [holding({ accountId: 2, quantity: 10 })],
        ndflRates: new Map([[1, 13], [2, 0]]),
      });

      expect(snapshot.portfolio.totalIncomePerYear).toBeCloseTo(120);
      expect(snapshot.assetsById.get(1)!.taxed).toBe(false);
      expect(snapshot.categories[0].taxed).toBe(false);
      expect(snapshot.portfolio.taxed).toBe(false);
    });

    it('a taxed account marks its category and the portfolio taxed', () => {
      const snapshot = calculatePortfolioSnapshot({
        ...base,
        holdings: [holding({ accountId: 3, quantity: 10 })],
        ndflRates: new Map([[3, 4]]),
      });

      expect(snapshot.portfolio.totalIncomePerYear).toBeCloseTo(115.2);
      expect(snapshot.categories[0].taxed).toBe(true);
      expect(snapshot.portfolio.taxed).toBe(true);
    });

    it('an asset nobody holds is untaxed and earns nothing', () => {
      const snapshot = calculatePortfolioSnapshot({ ...base, holdings: [], ndflRates: new Map([[1, 13]]) });
      expect(snapshot.assetsById.get(1)!.taxMultiplier).toBe(1);
      expect(snapshot.portfolio.totalIncomePerMonth).toBe(0);
      expect(snapshot.portfolio.taxed).toBe(false);
    });
  });
});
