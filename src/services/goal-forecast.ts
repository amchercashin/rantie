/**
 * When will the portfolio pay for the goal? A deliberately simple model:
 * - every payout is reinvested at the same net yield, once a month;
 * - all amounts are in today's money — payouts are assumed to grow with prices, so the yield is real;
 * - top-ups: a fixed amount every month, and/or one at the end of every year.
 * Income here is the same net "per month" money as the hero number and the goal.
 */
import { plural } from '@/lib/utils';

/** Fifty years: beyond that the answer is "later", not a date. */
export const FORECAST_HORIZON_MONTHS = 600;

export interface ForecastInput {
  /** Net income per month today, RUB. */
  incomePerMonth: number;
  /** Net yield per year, %. */
  yieldPercent: number;
  /** Top-up every month, RUB. */
  monthly?: number;
  /** Extra top-up once a year (at the end of each year from now), RUB. */
  yearly?: number;
}

/** Monthly rate that compounds to the yearly yield: reinvesting every month gives exactly `yield` a year. */
function monthlyRate(yieldPercent: number): number {
  return Number.isFinite(yieldPercent) && yieldPercent > 0 ? Math.pow(1 + yieldPercent / 100, 1 / 12) - 1 : 0;
}

function positive(value: number | undefined): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Income per month for month 0 (today) … `months`, capped at the horizon.
 * Money put in (a payout reinvested, a top-up) starts paying the monthly rate from the next month.
 */
export function incomePath(input: ForecastInput & { months: number }): number[] {
  const r = monthlyRate(input.yieldPercent);
  const monthly = positive(input.monthly);
  const yearly = positive(input.yearly);
  const months = Math.max(0, Math.min(Math.floor(input.months), FORECAST_HORIZON_MONTHS));
  const path = [Math.max(0, input.incomePerMonth)];
  for (let n = 1; n <= months; n++) {
    const prev = path[n - 1];
    const topUp = monthly + (n % 12 === 0 ? yearly : 0);
    path.push(prev * (1 + r) + topUp * r);
  }
  return path;
}

/**
 * Capital for month 0 (today) … `months`, in today's money: today's value, plus every payout
 * reinvested, plus the top-ups. Prices are assumed to move only with inflation, so nothing else adds.
 * Same steps as `incomePath`: the payout of month n−1 and the top-ups of month n are bought in month n.
 */
export function capitalPath(input: ForecastInput & { capital: number; months: number }): number[] {
  const income = incomePath(input);
  const monthly = positive(input.monthly);
  const yearly = positive(input.yearly);
  const path = [Math.max(0, input.capital)];
  for (let n = 1; n < income.length; n++) {
    path.push(path[n - 1] + income[n - 1] + monthly + (n % 12 === 0 ? yearly : 0));
  }
  return path;
}

/** First month the income reaches the goal: 0 when it already does, null when not within fifty years. */
export function monthsToGoal(input: ForecastInput & { goalPerMonth: number }): number | null {
  if (!(input.goalPerMonth > 0)) return null;
  if (input.incomePerMonth >= input.goalPerMonth) return 0;
  if (monthlyRate(input.yieldPercent) === 0) return null;
  const path = incomePath({ ...input, months: FORECAST_HORIZON_MONTHS });
  const index = path.findIndex((income) => income >= input.goalPerMonth);
  return index === -1 ? null : index;
}

/**
 * Yield to grow the portfolio by: income of the assets with a known value ÷ their value, %.
 * An asset with income but no price (rent from a flat whose price was never entered) would otherwise
 * make every reinvested ruble look like it buys far more income than it does. Null when no value is known.
 */
export function forecastYieldPercent(assets: Iterable<{ value: number; incomePerYear: number }>): number | null {
  let value = 0;
  let income = 0;
  for (const asset of assets) {
    if (!(asset.value > 0)) continue;
    value += asset.value;
    income += asset.incomePerYear;
  }
  return value > 0 ? (income / value) * 100 : null;
}

/** The month the goal is reached, counted from today. */
export function goalDate(months: number, now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() + months, 1, 12);
}

/** "через 8 месяцев" up to a year and a half, then "примерно через 10 лет". */
export function describeWait(months: number): string {
  if (months < 18) {
    const m = Math.max(1, Math.round(months));
    return `через ${m} ${plural(m, ['месяц', 'месяца', 'месяцев'])}`;
  }
  const years = Math.round(months / 12);
  return `примерно через ${years} ${plural(years, ['год', 'года', 'лет'])}`;
}
