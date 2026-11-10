import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import {
  getRateToRub, normalizeCurrency, ratesArrayToMap, updateExchangeRate, refreshExchangeRates, resetExchangeRate,
} from '@/services/exchange-rates';
import { createAssetDraft } from '@/services/asset-factory';
import type { ExchangeRate } from '@/models/types';

describe('exchange-rates', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('treats missing currency as RUB', () => {
    expect(normalizeCurrency(undefined)).toBe('RUB');
    expect(normalizeCurrency('')).toBe('RUB');
    expect(normalizeCurrency(' usd ')).toBe('USD');
  });

  it('always returns 1 for RUB', () => {
    expect(getRateToRub('RUB', new Map())).toBe(1);
  });

  it('returns manual rate for foreign currency and 0 when missing', () => {
    const rates = new Map([['USD', 90]]);
    expect(getRateToRub('USD', rates)).toBe(90);
    expect(getRateToRub('EUR', rates)).toBe(0);
  });

  it('converts exchange rate rows to a normalized map', () => {
    const rows: ExchangeRate[] = [
      { currency: ' usd ', rateToRub: 90, updatedAt: new Date(), source: 'manual' },
      { currency: 'EUR', rateToRub: 100, updatedAt: new Date(), source: 'manual' },
    ];

    expect(ratesArrayToMap(rows)).toEqual(new Map([
      ['USD', 90],
      ['EUR', 100],
    ]));
  });

  it('stores manual exchange rates with normalized currency', async () => {
    await updateExchangeRate(' usd ', 90);

    const rate = await db.exchangeRates.get('USD');
    expect(rate).toMatchObject({
      currency: 'USD',
      rateToRub: 90,
      source: 'manual',
    });
    expect(rate?.updatedAt).toBeInstanceOf(Date);
  });

  describe('refreshExchangeRates (MOEX)', () => {
    const moex = (rates: Record<string, number>) => async () => new Map(Object.entries(rates));
    const addAsset = (currency: string) =>
      db.assets.add(createAssetDraft({ type: 'Крипта', name: `Актив ${currency}`, currency, dataSource: 'manual' }));

    it('does not go to the network when every asset is in rubles', async () => {
      await addAsset('RUB');
      let called = false;
      const result = await refreshExchangeRates(async () => { called = true; return new Map(); });
      expect(called).toBe(false);
      expect(result).toEqual({ updated: [], missing: [] });
    });

    it('stores the MOEX rate for currencies that are held, and only for them', async () => {
      await addAsset('USD');
      const result = await refreshExchangeRates(moex({ USD: 82.55, EUR: 92.4, CNY: 12.4 }));

      expect(result).toEqual({ updated: ['USD'], missing: [] });
      expect(await db.exchangeRates.get('USD')).toMatchObject({ rateToRub: 82.55, source: 'moex' });
      expect(await db.exchangeRates.get('EUR')).toBeUndefined();
    });

    it('never overwrites a rate the user typed in', async () => {
      await addAsset('USD');
      await updateExchangeRate('USD', 95);
      const result = await refreshExchangeRates(moex({ USD: 82.55 }));

      expect(result).toEqual({ updated: [], missing: [] });
      expect(await db.exchangeRates.get('USD')).toMatchObject({ rateToRub: 95, source: 'manual' });
    });

    it('keeps the stored rate and reports the currency as missing when MOEX is unreachable', async () => {
      await addAsset('USD');
      await addAsset('EUR');
      await db.exchangeRates.put({ currency: 'EUR', rateToRub: 90, updatedAt: new Date(2026, 0, 1), source: 'moex' });
      const result = await refreshExchangeRates(async () => null);

      expect(result).toEqual({ updated: [], missing: ['USD'] });
      expect(await db.exchangeRates.get('USD')).toBeUndefined();
      expect(await db.exchangeRates.get('EUR')).toMatchObject({ rateToRub: 90 });
    });

    it('survives a fetcher that throws', async () => {
      await addAsset('USD');
      const result = await refreshExchangeRates(async () => { throw new Error('offline'); });
      expect(result).toEqual({ updated: [], missing: ['USD'] });
    });

    it('reset swaps a manual rate for the MOEX one, or keeps it when MOEX has none', async () => {
      await updateExchangeRate('USD', 95);
      expect(await resetExchangeRate('USD', async () => null)).toBe(false);
      expect(await db.exchangeRates.get('USD')).toMatchObject({ rateToRub: 95, source: 'manual' });

      expect(await resetExchangeRate('USD', moex({ USD: 82.55 }))).toBe(true);
      expect(await db.exchangeRates.get('USD')).toMatchObject({ rateToRub: 82.55, source: 'moex' });
    });
  });
});
