import type { DohodDividendRow, SmartlabDividendRow } from './heroincome-data';

/** A dividend row as stored by the sync. `recommended` only with `isForecast`. */
export interface SyncedDividendRow {
  date: Date;
  amount: number;
  isForecast?: boolean;
  recommended?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * A board recommendation and dohod.ru's forecast are the same dividend when their record dates
 * are this close. Dates of one dividend differ between sources (rounded to the month end, moved
 * by the AGM); two dividends of one company are months apart, or on one date.
 */
export const SAME_DIVIDEND_DAYS = 45;

const daysApart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / DAY_MS;

/**
 * dohod.ru stays the source of a stock it lists; smart-lab only refines its upcoming dividends.
 * - Recommended by the board of directors: the forecast of the same dividend (closest record
 *   date within 45 days) is marked `recommended` when date and amount agree — usually so, dohod.ru
 *   picks up recommendations into its forecasts — and is replaced by smart-lab's row otherwise.
 *   A recommendation with no forecast is added, unless dohod.ru already has that payment dated ahead.
 * - Canceled: the forecast of that dividend goes, and a zero forecast says «no payment expected»
 *   (it keeps the calendar from repeating last year's payment there).
 * The past, smart-lab's own forecasts and its paid rows do not matter here: dohod.ru has them.
 * Returns dohod.ru's rows and smart-lab's rows (forecasts only), stored apart under their sources.
 */
export function refineForecasts(
  dohod: DohodDividendRow[],
  smartlab: SmartlabDividendRow[],
  now: Date,
): { dohod: SyncedDividendRow[]; smartlab: SyncedDividendRow[] } {
  const rows: SyncedDividendRow[] = dohod.map((r) => ({ ...r }));
  const removed = new Set<number>();
  const used = new Set<number>();
  const added: SyncedDividendRow[] = [];

  const closestForecast = (date: Date): number => {
    let best = -1;
    rows.forEach((r, i) => {
      if (!r.isForecast || r.date <= now || used.has(i)) return;
      const days = daysApart(r.date, date);
      if (days <= SAME_DIVIDEND_DAYS && (best < 0 || days < daysApart(rows[best].date, date))) best = i;
    });
    return best;
  };
  const upcoming = smartlab.filter((r) => r.date > now).sort((a, b) => a.date.getTime() - b.date.getTime());

  for (const rec of upcoming.filter((r) => r.status === 'recommended')) {
    const i = closestForecast(rec.date);
    if (i >= 0) {
      used.add(i);
      if (rows[i].date.getTime() === rec.date.getTime() && Math.abs(rows[i].amount - rec.amount) < 0.005) {
        rows[i].recommended = true;
        continue;
      }
      removed.add(i);
    } else if (rows.some((r) => !r.isForecast && r.date > now && daysApart(r.date, rec.date) <= SAME_DIVIDEND_DAYS)) {
      continue;
    }
    added.push({ date: rec.date, amount: rec.amount, isForecast: true, recommended: true });
  }

  for (const canceled of upcoming.filter((r) => r.status === 'canceled')) {
    const i = closestForecast(canceled.date);
    if (i >= 0) {
      used.add(i);
      removed.add(i);
    }
    added.push({ date: canceled.date, amount: 0, isForecast: true });
  }

  return { dohod: rows.filter((_, i) => !removed.has(i)), smartlab: added };
}

/**
 * smart-lab as the only source of a stock (dohod.ru does not list it).
 * - paid → a payment;
 * - recommended → a forecast marked `recommended`; once its record date is past, a payment
 *   (the register has closed, smart-lab only has not moved the row yet);
 * - forecast / expected → a forecast while it is ahead;
 * - canceled → ahead: a zero forecast («no payment expected»); past: nothing.
 */
export function smartlabAsMain(rows: SmartlabDividendRow[], now: Date): SyncedDividendRow[] {
  const out: SyncedDividendRow[] = [];
  for (const r of rows) {
    const ahead = r.date > now;
    switch (r.status) {
      case 'paid':
        out.push({ date: r.date, amount: r.amount });
        break;
      case 'recommended':
        out.push(ahead ? { date: r.date, amount: r.amount, isForecast: true, recommended: true } : { date: r.date, amount: r.amount });
        break;
      case 'forecast':
      case 'expected':
        if (ahead) out.push({ date: r.date, amount: r.amount, isForecast: true });
        break;
      case 'canceled':
        if (ahead) out.push({ date: r.date, amount: 0, isForecast: true });
        break;
    }
  }
  return out;
}
