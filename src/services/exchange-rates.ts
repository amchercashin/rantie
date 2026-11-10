import { db } from '@/db/database';
import type { ExchangeRate } from '@/models/types';

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
