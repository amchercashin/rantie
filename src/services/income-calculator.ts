export function calcAssetIncomePerYear(
  quantity: number,
  annualIncomePerUnit: number,
): number {
  const result = quantity * annualIncomePerUnit;
  return isFinite(result) ? result : 0;
}

export function calcAssetIncomePerMonth(
  quantity: number,
  annualIncomePerUnit: number,
): number {
  return calcAssetIncomePerYear(quantity, annualIncomePerUnit) / 12;
}

interface IncomeItem {
  quantity: number;
  annualIncome: number;
}

export function calcPortfolioIncome(items: IncomeItem[]): {
  perYear: number;
  perMonth: number;
} {
  const perYear = items.reduce(
    (sum, item) =>
      sum + calcAssetIncomePerYear(item.quantity, item.annualIncome),
    0,
  );
  return { perYear, perMonth: perYear / 12 };
}

export function calcYieldPercent(annualIncome: number, portfolioValue: number): number {
  if (portfolioValue === 0) return 0;
  return (annualIncome / portfolioValue) * 100;
}

export interface PaymentRecord {
  amount: number;
  date: Date;
}

export interface AnnualIncomeResult {
  annualIncome: number;
  usedPayments: PaymentRecord[];
}

/**
 * "12 pockets": the sum of payments over the trailing 12 months. A record dated after `now`
 * (an announced dividend from MOEX, a payment typed in ahead of time) is expected income — it
 * shows up among the upcoming payments and starts to count on its date.
 */
export function calcAnnualIncomePerUnit(
  history: PaymentRecord[],
  now: Date = new Date(),
): AnnualIncomeResult {
  const empty = { annualIncome: 0, usedPayments: [] as PaymentRecord[] };
  if (history.length === 0) return empty;

  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const usedPayments = history
    .filter(p => p.date >= twelveMonthsAgo && p.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (usedPayments.length === 0) return empty;

  const annualIncome = usedPayments.reduce((sum, p) => sum + p.amount, 0);
  return { annualIncome, usedPayments };
}

export function calcCAGR(
  history: PaymentRecord[],
  now: Date = new Date(),
): number | null {
  if (history.length === 0) return null;
  const currentYear = now.getFullYear();
  const byYear = new Map<number, number>();
  for (const p of history) {
    const year = p.date.getFullYear();
    if (year >= currentYear) continue;
    byYear.set(year, (byYear.get(year) ?? 0) + p.amount);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  if (years.length === 0) return null;
  const firstYear = years[0];
  const lastYear = currentYear - 1; // always last full calendar year
  if (lastYear <= firstYear) return null;
  const incomeFirst = byYear.get(firstYear)!;
  const incomeLast = byYear.get(lastYear) ?? 0;
  if (incomeFirst <= 0 || incomeLast <= 0) return null;
  const span = lastYear - firstYear;
  return (Math.pow(incomeLast / incomeFirst, 1 / span) - 1) * 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Payments on (almost) the same day form one payout, e.g. split coupons. */
const SAME_PAYOUT_DAYS = 3;
/** Longest grace after the period ends before a pocket counts as empty. */
const MAX_GRACE_DAYS = 45;

/**
 * "Pocket per period": the latest payout fills a pocket that lasts one payment
 * period (12 / frequency months). Monthly rent therefore counts in full at once,
 * and a pocket runs dry when the next payout is overdue by more than half a
 * period (at most 45 days).
 */
export function calcAnnualIncomePerUnitByPeriod(
  history: PaymentRecord[],
  frequencyPerYear: number,
  now: Date = new Date(),
): AnnualIncomeResult {
  const empty = { annualIncome: 0, usedPayments: [] as PaymentRecord[] };
  if (history.length === 0 || !(frequencyPerYear > 0)) return empty;

  const past = history
    .filter((p) => p.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  if (past.length === 0) return empty;

  const latest = past[0];
  const periodDays = 365 / frequencyPerYear;
  const graceDays = Math.min(periodDays / 2, MAX_GRACE_DAYS);
  const ageDays = (now.getTime() - latest.date.getTime()) / DAY_MS;
  if (ageDays > periodDays + graceDays) return empty;

  const payout = past.filter((p) => (latest.date.getTime() - p.date.getTime()) / DAY_MS <= SAME_PAYOUT_DAYS);
  const perPayout = payout.reduce((sum, p) => sum + p.amount, 0);
  return { annualIncome: perPayout * frequencyPerYear, usedPayments: payout };
}

export interface IncomeAssetLike {
  paymentPerUnitSource: 'fact' | 'manual';
  paymentPerUnit?: number;
  frequencyPerYear: number;
}

/**
 * Annual income per unit for an asset at `now`, before tax.
 * - manual override wins;
 * - 'year' spread: sum of payments over the trailing 12 months (12 pockets);
 * - 'period' spread: latest payout × frequency (pocket per period).
 * Only payments dated on or before `now` should be passed for historical points.
 */
export function calcAssetAnnualIncomePerUnit(
  asset: IncomeAssetLike,
  spread: 'year' | 'period',
  history: PaymentRecord[],
  now: Date = new Date(),
): AnnualIncomeResult {
  if (asset.paymentPerUnitSource === 'manual' && asset.paymentPerUnit != null) {
    return { annualIncome: asset.paymentPerUnit, usedPayments: [] };
  }
  if (spread === 'period') {
    return calcAnnualIncomePerUnitByPeriod(history, asset.frequencyPerYear, now);
  }
  return calcAnnualIncomePerUnit(history, now);
}
