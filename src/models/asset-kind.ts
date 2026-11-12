import type { Asset } from './types';

/** Types whose payment history comes from the exchange (MOEX / dohod.ru / Parus). */
export const EXCHANGE_TYPES = ['Акции', 'Облигации', 'Фонды'] as const;

/**
 * Exchange-traded security with a known identifier. Its payment history is the
 * security's own history (not the user's receipts), so the trailing 12-month
 * window is complete — unless the security started paying less than a year ago
 * (see annualizeShortHistory).
 */
export function isExchangeTraded(asset: Pick<Asset, 'type' | 'ticker' | 'isin' | 'moexSecid'>): boolean {
  return !!(asset.ticker || asset.isin || asset.moexSecid)
    && (EXCHANGE_TYPES as readonly string[]).includes(asset.type);
}

/**
 * How a payment is spread over months ("pockets"):
 * - 'year'   — every payment is split into 12 monthly pockets (exchange securities;
 *              robust against irregular dividends);
 * - 'period' — a payment covers its own period, 12 / frequency months
 *              (rent, deposits and other income the user records themselves,
 *              so a monthly rent counts in full straight away).
 */
export type IncomeSpread = 'year' | 'period';

export function incomeSpreadOf(asset: Pick<Asset, 'type' | 'ticker' | 'isin' | 'moexSecid' | 'frequencyPerYear'>): IncomeSpread {
  if (isExchangeTraded(asset)) return 'year';
  return asset.frequencyPerYear > 0 ? 'period' : 'year';
}
