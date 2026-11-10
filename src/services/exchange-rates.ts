import { db } from '@/db/database';
import type { ExchangeRate } from '@/models/types';
import { fetchIndicativeRates } from './moex-api';

export const BASE_CURRENCY = 'RUB';

/**
 * Spellings brokers and AI use for the same currency. RUR/SUR are the old ruble
 * codes still found in reports and on MOEX; an unknown code would get no rate
 * and value the asset at zero.
 */
const CURRENCY_ALIASES: Record<string, string> = {
  RUR: 'RUB', SUR: 'RUB', '₽': 'RUB', 'РУБ': 'RUB', 'РУБ.': 'RUB', 'РУБЛЬ': 'RUB', 'РУБЛИ': 'RUB', 'РУБЛЕЙ': 'RUB',
  '$': 'USD', 'ДОЛЛАР': 'USD', 'ДОЛЛ.': 'USD',
  '€': 'EUR', 'ЕВРО': 'EUR',
  '¥': 'CNY', 'ЮАНЬ': 'CNY', 'ЮАНИ': 'CNY', 'ЮАНЕЙ': 'CNY',
};

export function normalizeCurrency(currency: string | undefined | null): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized) return BASE_CURRENCY;
  return CURRENCY_ALIASES[normalized] ?? normalized;
}

export function ratesArrayToMap(rates: ExchangeRate[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const rate of rates) {
    if (rate.rateToRub > 0 && isFinite(rate.rateToRub)) {
      map.set(normalizeCurrency(rate.currency), rate.rateToRub);
    }
  }
  return map;
}

export function getRateToRub(
  currency: string | undefined | null,
  rates: Map<string, number>,
): number {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return 1;
  return rates.get(normalized) ?? 0;
}

export async function getExchangeRates(): Promise<ExchangeRate[]> {
  return db.exchangeRates.toArray();
}

export async function updateExchangeRate(currency: string, rateToRub: number): Promise<void> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return;
  if (!isFinite(rateToRub) || rateToRub <= 0) return;
  await db.exchangeRates.put({
    currency: normalized,
    rateToRub,
    updatedAt: new Date(),
    source: 'manual',
  });
}

export async function deleteExchangeRate(currency: string): Promise<void> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return;
  await db.exchangeRates.delete(normalized);
}

export type RatesFetcher = () => Promise<Map<string, number> | null>;

export interface RatesRefreshResult {
  /** Currencies whose MOEX rate was stored now. */
  updated: string[];
  /** Held currencies that still have no rate at all — their assets count as zero. */
  missing: string[];
}

async function safeFetch(fetchRates: RatesFetcher): Promise<Map<string, number> | null> {
  try {
    return await fetchRates();
  } catch {
    return null;
  }
}

const usable = (rate: number | undefined): rate is number => rate != null && isFinite(rate) && rate > 0;

/**
 * Loads rates from MOEX for every non-ruble currency the portfolio holds.
 * A rate the user typed in stays as is; when MOEX is unreachable the stored
 * rate is kept — a rate is never replaced with zero.
 */
export async function refreshExchangeRates(fetchRates: RatesFetcher = fetchIndicativeRates): Promise<RatesRefreshResult> {
  const assets = await db.assets.toArray();
  const currencies = [...new Set(assets.map((asset) => normalizeCurrency(asset.currency)))]
    .filter((currency) => currency !== BASE_CURRENCY)
    .sort();
  if (currencies.length === 0) return { updated: [], missing: [] };

  const fetched = await safeFetch(fetchRates);
  const updated: string[] = [];
  const missing: string[] = [];
  const now = new Date();

  await db.transaction('rw', db.exchangeRates, async () => {
    for (const currency of currencies) {
      const stored = await db.exchangeRates.get(currency);
      if (stored?.source === 'manual' && usable(stored.rateToRub)) continue;
      const rate = fetched?.get(currency);
      if (usable(rate)) {
        await db.exchangeRates.put({ currency, rateToRub: rate, updatedAt: now, source: 'moex' });
        updated.push(currency);
      } else if (!usable(stored?.rateToRub)) {
        missing.push(currency);
      }
    }
  });

  return { updated, missing };
}

/** Drops the user's own rate in favour of the MOEX one. False (and nothing changed) when MOEX has no rate. */
export async function resetExchangeRate(currency: string, fetchRates: RatesFetcher = fetchIndicativeRates): Promise<boolean> {
  const normalized = normalizeCurrency(currency);
  if (normalized === BASE_CURRENCY) return false;
  const rate = (await safeFetch(fetchRates))?.get(normalized);
  if (!usable(rate)) return false;
  await db.exchangeRates.put({ currency: normalized, rateToRub: rate, updatedAt: new Date(), source: 'moex' });
  return true;
}
