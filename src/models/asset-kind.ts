import type { Asset } from './types';
import { getRateToRub, normalizeCurrency } from '@/services/exchange-rates';

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

/**
 * What one unit is worth in its own currency: the price, plus the accrued interest (НКД) for a bond —
 * what a buyer pays for it. Null without a price: the value is unknown, not zero. The one definition of
 * value for the capital and the categories (portfolio-calculator) and the Счета tab.
 */
export function unitValue(asset: Pick<Asset, 'type' | 'currentPrice' | 'accruedInterest'>): number | null {
  if (asset.currentPrice == null) return null;
  return asset.currentPrice + (asset.type === 'Облигации' ? asset.accruedInterest ?? 0 : 0);
}

type PricedAsset = Pick<Asset, 'type' | 'currentPrice' | 'accruedInterest' | 'currency' | 'accruedInterestCurrency'>;

/**
 * Value of one unit in rubles. Converts the price by `asset.currency`, and a bond's НКД by
 * `asset.accruedInterestCurrency ?? asset.currency` (replacement bonds have a USD/EUR face value
 * while MOEX quotes НКД in rubles). Null without a price; 0 when the asset's currency has no rate.
 */
export function unitValueRub(asset: PricedAsset, exchangeRates: Map<string, number>): number | null {
  if (asset.currentPrice == null) return null;
  const priceRate = getRateToRub(asset.currency, exchangeRates);
  if (priceRate <= 0) return 0;
  const priceRub = asset.currentPrice * priceRate;
  if (asset.type !== 'Облигации' || !asset.accruedInterest) return priceRub;
  const nkdRate = getRateToRub(asset.accruedInterestCurrency ?? asset.currency, exchangeRates);
  return priceRub + asset.accruedInterest * nkdRate;
}

/**
 * Value of one unit in the asset's own currency. When a bond's НКД is quoted in another currency
 * (e.g. RUB for a USD replacement bond), НКД is converted into `asset.currency` using the rates.
 */
export function unitValueOwn(asset: PricedAsset, exchangeRates: Map<string, number>): number | null {
  if (asset.currentPrice == null) return null;
  if (asset.type !== 'Облигации' || !asset.accruedInterest) return asset.currentPrice;
  const assetCur = normalizeCurrency(asset.currency);
  const nkdCur = normalizeCurrency(asset.accruedInterestCurrency ?? asset.currency);
  if (assetCur === nkdCur) return asset.currentPrice + asset.accruedInterest;
  const priceRate = getRateToRub(assetCur, exchangeRates);
  const nkdRate = getRateToRub(nkdCur, exchangeRates);
  if (priceRate <= 0 || nkdRate <= 0) return asset.currentPrice;
  return asset.currentPrice + asset.accruedInterest * (nkdRate / priceRate);
}
