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
  /**
   * Set when a history shorter than a year was scaled to a full year:
   * annualIncome = averagePayout × frequencyPerYear (see annualizeShortHistory).
   */
  annualized?: { frequencyPerYear: number; payouts: number; averagePayout: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Payments on (almost) the same day form one payout, e.g. split coupons. */
const SAME_PAYOUT_DAYS = 3;
/** Longest grace after the period ends before a pocket counts as empty. */
const MAX_GRACE_DAYS = 45;

/** Start of the trailing 12-month window. */
function yearBefore(now: Date): Date {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 12);
  return d;
}

/** A payout is overdue once its period and a grace of half a period (at most 45 days) are over. */
function isOverdue(latest: Date, frequencyPerYear: number, now: Date): boolean {
  const periodDays = 365 / frequencyPerYear;
  const graceDays = Math.min(periodDays / 2, MAX_GRACE_DAYS);
  return (now.getTime() - latest.getTime()) / DAY_MS > periodDays + graceDays;
}

/** Number of payouts in payments sorted newest first; records within 3 days are one payout. */
function countPayouts(newestFirst: PaymentRecord[]): number {
  let count = 0;
  let anchor: number | null = null;
  for (const p of newestFirst) {
    const t = p.date.getTime();
    if (anchor == null || (anchor - t) / DAY_MS > SAME_PAYOUT_DAYS) {
      count++;
      anchor = t;
    }
  }
  return count;
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

  const twelveMonthsAgo = yearBefore(now);

  const usedPayments = history
    .filter(p => p.date >= twelveMonthsAgo && p.date <= now)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  if (usedPayments.length === 0) return empty;

  const annualIncome = usedPayments.reduce((sum, p) => sum + p.amount, 0);
  return { annualIncome, usedPayments };
}

/**
 * A security that started paying less than a year ago has not filled its 12 pockets yet, and
 * the empty ones would read as missing income: a fund paying monthly since April would show
 * 7/12 of what it pays. While its payouts keep coming on rhythm (the latest one is not overdue),
 * such a history counts as the average payout × frequency — never less than the plain sum.
 * Once a year of history is behind it, the payouts number the frequency and both give the same,
 * so nothing jumps when the history comes of age.
 *
 * The frequency has to rest on something: two payouts at least (it is inferred from their
 * intervals), or one when it is known on its own — a bond's coupon period (`minPayouts` = 1).
 * A history that reaches back more than a year is left alone: a skipped payment there is real.
 */
export function annualizeShortHistory(
  trailing: AnnualIncomeResult,
  history: PaymentRecord[],
  frequencyPerYear: number,
  now: Date,
  minPayouts = 2,
): AnnualIncomeResult {
  const used = trailing.usedPayments;
  if (!(frequencyPerYear > 0) || used.length === 0) return trailing;
  const windowStart = yearBefore(now);
  if (history.some((p) => p.date < windowStart)) return trailing;
  const payouts = countPayouts(used);
  if (payouts < minPayouts) return trailing;
  if (isOverdue(used[0].date, frequencyPerYear, now)) return trailing;

  const averagePayout = trailing.annualIncome / payouts;
  const annualIncome = averagePayout * frequencyPerYear;
  if (annualIncome <= trailing.annualIncome) return trailing;
  return { annualIncome, usedPayments: used, annualized: { frequencyPerYear, payouts, averagePayout } };
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
  if (isOverdue(latest.date, frequencyPerYear, now)) return empty;

  const payout = past.filter((p) => (latest.date.getTime() - p.date.getTime()) / DAY_MS <= SAME_PAYOUT_DAYS);
  const perPayout = payout.reduce((sum, p) => sum + p.amount, 0);
  return { annualIncome: perPayout * frequencyPerYear, usedPayments: payout };
}

export interface IncomeAssetLike {
  paymentPerUnitSource: 'fact' | 'manual';
  paymentPerUnit?: number;
  frequencyPerYear: number;
  /** A bond knows its frequency from the coupon period, so one coupon is enough to annualize. */
  type?: string;
}

/**
 * Annual income per unit for an asset at `now`, before tax.
 * - manual override wins;
 * - 'year' spread: sum of payments over the trailing 12 months (12 pockets); a history shorter
 *   than a year — average payout × frequency (annualizeShortHistory);
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
  const trailing = calcAnnualIncomePerUnit(history, now);
  return annualizeShortHistory(trailing, history, asset.frequencyPerYear, now, asset.type === 'Облигации' ? 1 : 2);
}
