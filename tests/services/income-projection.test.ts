import { describe, expect, it } from 'vitest';
import { calculatePortfolioSnapshot } from '@/services/portfolio-calculator';
import { projectIncome, bucketByMonth, upcomingPayments, incomeTimeline } from '@/services/income-projection';
import type { Asset, PaymentHistory } from '@/models/types';
import type { Holding } from '@/models/account';

const NOW = new Date('2026-09-25T12:00:00');
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function stock(overrides: Partial<Asset>): Asset {
  return {
    id: 1,
    type: 'Акции',
    ticker: 'SBER',
    name: 'Сбер',
    dataSource: 'moex',
    paymentPerUnitSource: 'fact',
    frequencyPerYear: 1,
    frequencySource: 'moex',
    currentPrice: 100,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function rent(overrides: Partial<Asset>): Asset {
  return stock({ type: 'Недвижимость', ticker: undefined, name: 'Квартира', dataSource: 'manual', frequencyPerYear: 12, frequencySource: 'manual', ...overrides });
}

function holding(assetId: number, quantity: number): Holding {
  return { id: assetId, accountId: 1, assetId, quantity, quantitySource: 'manual', createdAt: NOW, updatedAt: NOW };
}

function payment(assetId: number, date: string, amount: number, extra: Partial<PaymentHistory> = {}): PaymentHistory {
  return { assetId, date: new Date(`${date}T12:00:00`), amount, type: 'dividend', dataSource: 'moex', ...extra };
}

function run(assets: Asset[], holdings: Holding[], history: PaymentHistory[], ndfl = new Map<string, number>()) {
  const snapshot = calculatePortfolioSnapshot({
    assets, holdings, paymentHistory: history, ndflRates: ndfl, exchangeRates: new Map([['USD', 90]]), now: NOW,
  });
  const input = { assets, paymentHistory: history, assetsById: snapshot.assetsById, ndflRates: ndfl, now: NOW };
  return { snapshot, projection: projectIncome(input), timeline: incomeTimeline(input) };
}

describe('projectIncome', () => {
  it('repeats last-year payments one year later, scaled by quantity and tax', () => {
    const { projection } = run(
      [stock({ id: 1 })],
      [holding(1, 10)],
      [payment(1, '2025-07-18', 30), payment(1, '2026-07-18', 36)],
      new Map([['Акции', 13]]),
    );

    expect(projection).toHaveLength(1);
    expect(day(projection[0].date)).toBe('2027-07-18');
    expect(projection[0].amount).toBeCloseTo(36 * 10 * 0.87);
    expect(projection[0].perUnit).toBe(36);
    expect(projection[0]).toMatchObject({ estimated: false, basis: 'last-year' });
  });

  it('prefers a forecast over the repeated payment', () => {
    const { projection } = run(
      [stock({ id: 1 })],
      [holding(1, 1)],
      [payment(1, '2026-07-18', 36), payment(1, '2027-07-10', 40, { isForecast: true })],
    );
    expect(projection).toHaveLength(1);
    expect(day(projection[0].date)).toBe('2027-07-10');
    expect(projection[0]).toMatchObject({ perUnit: 40, basis: 'forecast' });
  });

  it('keeps a forecast apart from a real record dated in the future', () => {
    // Neither says the dividend is declared: dohod.ru forecasts carry no stage,
    // and a future MOEX/hand-typed record is just a date.
    const { projection } = run(
      [stock({ id: 1 })],
      [holding(1, 1)],
      [
        payment(1, '2026-07-18', 36),
        payment(1, '2026-12-15', 5),
        payment(1, '2027-07-10', 40, { isForecast: true, dataSource: 'dohod' }),
      ],
    );
    expect(projection.map((p) => [day(p.date), p.basis])).toEqual([
      ['2026-12-15', 'scheduled'],
      ['2027-07-10', 'forecast'],
    ]);
  });

  it('treats a zero-amount forecast as "no payment expected"', () => {
    const { projection, timeline } = run(
      [stock({ id: 1 })],
      [holding(1, 1)],
      [payment(1, '2026-07-18', 36), payment(1, '2027-07-10', 0, { isForecast: true })],
    );
    expect(projection).toEqual([]);
    expect(timeline[36].value).toBe(0);
  });

  it('adds up to the yearly income when there are no forecasts', () => {
    const { snapshot, projection } = run(
      [
        stock({ id: 1 }),
        stock({ id: 2, type: 'Облигации', ticker: 'SU26238', currency: 'USD', frequencyPerYear: 2 }),
        rent({ id: 3, type: 'Вклады', paymentPerUnit: 1800, paymentPerUnitSource: 'manual' }),
        rent({ id: 4 }),
      ],
      [holding(1, 10), holding(2, 3), holding(3, 1), holding(4, 1)],
      [
        payment(1, '2026-07-18', 36),
        payment(2, '2025-12-03', 35.4),
        payment(2, '2026-06-03', 35.4),
        payment(4, '2026-09-05', 50000, { dataSource: 'manual' }),
      ],
      new Map([['Акции', 13], ['Облигации', 13]]),
    );

    const total = projection.reduce((sum, p) => sum + p.amount, 0);
    expect(total).toBeCloseTo(snapshot.portfolio.totalIncomePerYear, 6);
  });

  it('spreads manual income evenly by frequency and marks it estimated', () => {
    const { projection } = run(
      [rent({ id: 1, type: 'Вклады', paymentPerUnit: 1200, paymentPerUnitSource: 'manual', frequencyPerYear: 4 })],
      [holding(1, 1)],
      [],
    );
    expect(projection).toHaveLength(4);
    expect(projection.every((p) => p.estimated && p.amount === 300)).toBe(true);
    expect(new Set(projection.map((p) => p.date.getMonth())).size).toBe(4);
  });

  it('anchors manual income on a known next payment date', () => {
    const { projection } = run(
      [stock({ id: 1, paymentPerUnit: 100, paymentPerUnitSource: 'manual', frequencyPerYear: 2, nextExpectedDate: new Date('2026-11-10T12:00:00') })],
      [holding(1, 1)],
      [],
    );
    expect(projection.map((p) => day(p.date))).toEqual(['2026-11-10', '2027-05-10']);
    expect(projection.every((p) => !p.estimated)).toBe(true);
  });

  it('repeats monthly rent every month from the latest payout', () => {
    const { projection, snapshot } = run([rent({ id: 1 })], [holding(1, 1)], [payment(1, '2026-09-05', 50000)]);
    // One month of history is enough: the pocket covers its own month.
    expect(snapshot.portfolio.totalIncomePerMonth).toBe(50000);
    expect(projection).toHaveLength(12);
    expect(day(projection[0].date)).toBe('2026-10-05');
    expect(projection[0].basis).toBe('last-payout');
  });

  it('skips assets without holdings', () => {
    const { projection } = run([stock({ id: 1 }), stock({ id: 2 })], [holding(1, 0)], [payment(1, '2026-07-18', 36)]);
    expect(projection).toEqual([]);
  });
});

describe('incomeTimeline', () => {
  it('shows history, the current month and a forecast', () => {
    const { timeline } = run(
      [stock({ id: 1 })],
      [holding(1, 12)],
      [payment(1, '2025-07-18', 12), payment(1, '2026-07-18', 24), payment(1, '2027-07-10', 36, { isForecast: true })],
    );
    expect(timeline).toHaveLength(37);
    const now = timeline[24];
    expect(now.future).toBe(false);
    expect(now.value).toBe(24); // 24 ₽ × 12 шт / 12 мес
    // A year before the latest dividend only the previous one was in the pocket.
    expect(timeline.find((p) => day(p.date) === '2026-06-25')!.value).toBe(12);
    // After the forecast payment arrives, the pocket holds 36.
    const last = timeline[36];
    expect(last.future).toBe(true);
    expect(last.value).toBe(36);
  });

  it('keeps manual income flat', () => {
    const { timeline } = run(
      [rent({ id: 1, paymentPerUnit: 120000, paymentPerUnitSource: 'manual' })],
      [holding(1, 1)],
      [],
    );
    expect(new Set(timeline.map((p) => p.value))).toEqual(new Set([10000]));
  });
});

describe('bucketByMonth', () => {
  it('returns at least 12 real months starting from the current month', () => {
    const buckets = bucketByMonth([], NOW);
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toMatchObject({ month: 8, year: 2026 });
    expect(buckets[11]).toMatchObject({ month: 7, year: 2027 });
  });

  it('keeps each payment under its true month (13 buckets when the horizon ends mid-month)', () => {
    const { projection } = run(
      [stock({ id: 1 })],
      [holding(1, 1)],
      [payment(1, '2026-01-10', 5), payment(1, '2026-01-20', 7), payment(1, '2026-09-10', 1)],
    );
    const buckets = bucketByMonth(projection, NOW);
    expect(buckets).toHaveLength(13);
    expect(buckets[0]).toMatchObject({ month: 8, year: 2026, total: 0 });
    const jan = buckets.find((b) => b.month === 0)!;
    expect(jan).toMatchObject({ year: 2027, total: 12 });
    expect(buckets[12]).toMatchObject({ month: 8, year: 2027, total: 1 });
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(13);
  });
});

describe('upcomingPayments', () => {
  it('returns known future payments only, soonest first', () => {
    const { projection } = run(
      [
        stock({ id: 1 }),
        rent({ id: 2, type: 'Вклады', paymentPerUnit: 1200, paymentPerUnitSource: 'manual' }),
      ],
      [holding(1, 1), holding(2, 1)],
      [payment(1, '2025-12-01', 5), payment(1, '2026-06-01', 7)],
    );
    const upcoming = upcomingPayments(projection, NOW, 5);
    expect(upcoming.map((p) => p.assetId)).toEqual([1, 1]);
    expect(day(upcoming[0].date)).toBe('2026-12-01');
  });
});
