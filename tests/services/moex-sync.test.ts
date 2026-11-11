import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import Dexie, { liveQuery } from 'dexie';
import { db } from '@/db/database';

vi.mock('@/services/heroincome-data', () => ({
  isDohodAvailable: vi.fn().mockResolvedValue(false),
  fetchDohodDividends: vi.fn().mockResolvedValue(null),
  resetDohodCache: vi.fn(),
  findFundKey: vi.fn().mockResolvedValue(null),
  fetchFundDistributions: vi.fn().mockResolvedValue(null),
  isDohodIndexLoaded: vi.fn().mockResolvedValue(true),
  isFundIndexLoaded: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/services/moex-api', () => ({
  resolveSecurityInfo: vi.fn(),
  fetchStockPrice: vi.fn(),
  fetchBondData: vi.fn(),
  fetchDividends: vi.fn(),
  fetchCouponHistory: vi.fn().mockResolvedValue([]),
  fetchBatchStockPrices: vi.fn().mockResolvedValue(new Map()),
  fetchBatchBondData: vi.fn().mockResolvedValue(new Map()),
  fetchIndicativeRates: vi.fn().mockResolvedValue(null),
  chunk: vi.fn((arr: unknown[], size: number) => {
    const result: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }),
}));

import {
  resolveSecurityInfo,
  fetchDividends,
  fetchBatchStockPrices,
  fetchBatchBondData,
  fetchIndicativeRates,
} from '@/services/moex-api';
import {
  isDohodAvailable, fetchDohodDividends, findFundKey, fetchFundDistributions,
  isDohodIndexLoaded, isFundIndexLoaded,
} from '@/services/heroincome-data';
import { syncAllAssets, syncAssetPayments } from '@/services/moex-sync';
import { getLastSyncAt, getLastPriceSyncAt } from '@/services/sync-state';

const ASSET_DEFAULTS = {
  paymentPerUnitSource: 'fact' as const,
  frequencyPerYear: 1,
  frequencySource: 'manual' as const,
};

describe('syncAllAssets', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete();
    await db.open();
  });

  it('syncs stock: updates price and writes frequency to asset', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencySource: 'moex' as const,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SBER',
      primaryBoardId: 'TQBR',
      market: 'shares',
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 317.63, prevPrice: 316.65 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 1, nextExpectedCutoffDate: null },
      history: [{ date: new Date('2025-07-18'), amount: 34.84 }],
    });

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(317.63);
    expect(asset!.moexFrequency).toBe(1);
    expect(asset!.frequencyPerYear).toBe(1);
    expect(asset!.frequencySource).toBe('moex');
  });

  it('replaces a ticker-only name with the MOEX short name, keeps user names', async () => {
    const tickerNamed = (await db.assets.add({
      type: 'Акции', ticker: 'SBER', name: 'SBER', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    })) as number;
    const userNamed = (await db.assets.add({
      type: 'Акции', ticker: 'GAZP', name: 'Мой Газпром', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock).mockImplementation(async (q: string) => ({
      secid: q, primaryBoardId: 'TQBR', market: 'shares', shortName: q === 'SBER' ? 'Сбербанк' : 'ГАЗПРОМ ао',
    }));
    (fetchBatchStockPrices as Mock).mockResolvedValue(new Map());
    (fetchDividends as Mock).mockResolvedValue(null);

    await syncAllAssets();

    expect((await db.assets.get(tickerNamed))!.name).toBe('Сбербанк');
    expect((await db.assets.get(userNamed))!.name).toBe('Мой Газпром');
  });

  it('syncs bond: converts price from % to rub, updates frequency on asset', async () => {
    const assetId = (await db.assets.add({
      type: 'Облигации',
      ticker: 'SU26238RMFS4',
      name: 'ОФЗ 26238',
      faceValue: 1000,
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencyPerYear: 2,
      frequencySource: 'moex' as const,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SU26238RMFS4',
      primaryBoardId: 'TQOB',
      market: 'bonds',
    });
    (fetchBatchBondData as Mock).mockResolvedValue(
      new Map([['SU26238RMFS4', {
        currentPrice: 61.5,
        prevPrice: 61.107,
        faceValue: 1000,
        accruedInterest: 23.45,
        couponValue: 35.4,
        nextCouponDate: '2026-06-03',
        couponPeriod: 182,
      }]]),
    );

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(615); // 1000 * 61.5 / 100
    expect(asset!.faceValue).toBe(1000);
    expect(asset!.accruedInterest).toBe(23.45);
    expect(asset!.moexFrequency).toBe(2);
    expect(asset!.frequencyPerYear).toBe(2); // 365/182 ≈ 2
    expect(asset!.frequencySource).toBe('moex');
    expect(asset!.nextExpectedDate).toEqual(new Date('2026-06-03'));
  });

  it('loads exchange rates even when nothing is exchange-traded (USD crypto only)', async () => {
    await db.assets.add({
      type: 'Крипта', name: 'stETH', currency: 'USD', dataSource: 'manual',
      paymentPerUnit: 40, createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, paymentPerUnitSource: 'manual',
    });
    (fetchIndicativeRates as Mock).mockResolvedValueOnce(new Map([['USD', 82.55]]));

    const result = await syncAllAssets({ pricesOnly: true });

    expect(fetchIndicativeRates).toHaveBeenCalledTimes(1);
    expect(result.ratesUpdated).toEqual(['USD']);
    expect(await db.exchangeRates.get('USD')).toMatchObject({ rateToRub: 82.55, source: 'moex' });
  });

  it('warns when a held currency still has no rate after the sync', async () => {
    await db.assets.add({
      type: 'Крипта', name: 'stETH', currency: 'USD', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });

    const result = await syncAllAssets();

    expect(result.warnings.some((w) => w.includes('USD'))).toBe(true);
  });

  it('skips non-exchange assets (realestate, deposit, other)', async () => {
    await db.assets.add({
      type: 'Недвижимость',
      name: 'Квартира',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencyPerYear: 12,
    });

    const result = await syncAllAssets();

    expect(result.skipped).toBe(1);
    expect(result.synced).toBe(0);
    expect(resolveSecurityInfo).not.toHaveBeenCalled();
  });

  it('skips assets without ticker', async () => {
    await db.assets.add({
      type: 'Акции',
      name: 'Какая-то акция',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    });

    const result = await syncAllAssets();
    expect(result.skipped).toBe(1);
  });

  it('does not overwrite manual frequency on asset', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencyPerYear: 4,
      frequencySource: 'manual' as const,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SBER',
      primaryBoardId: 'TQBR',
      market: 'shares',
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 317.63, prevPrice: 316.65 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 1, nextExpectedCutoffDate: null },
      history: [{ date: new Date('2025-07-18'), amount: 34.84 }],
    });

    await syncAllAssets();

    const asset = await db.assets.get(assetId);
    // Manual frequency is preserved
    expect(asset!.frequencyPerYear).toBe(4);
    expect(asset!.frequencySource).toBe('manual');
    // But moexFrequency is still stored for reference
    expect(asset!.moexFrequency).toBe(1);
  });

  it('updates price but keeps asset fields when dividends fetch fails', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SBER',
      primaryBoardId: 'TQBR',
      market: 'shares',
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 317.63, prevPrice: 316.65 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    await syncAllAssets();

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(317.63);
    // No moex frequency written when dividends fetch returns null
    expect(asset!.moexFrequency).toBeUndefined();
  });

  it('updates existing moex frequency on asset with fresh data', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencyPerYear: 1,
      frequencySource: 'moex' as const,
      moexFrequency: 1,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SBER',
      primaryBoardId: 'TQBR',
      market: 'shares',
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 317.63, prevPrice: 316.65 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 2, nextExpectedCutoffDate: null },
      history: [{ date: new Date('2025-07-18'), amount: 34.84 }],
    });

    await syncAllAssets();

    const asset = await db.assets.get(assetId);
    expect(asset!.frequencyPerYear).toBe(2);
    expect(asset!.moexFrequency).toBe(2);
    expect(asset!.frequencySource).toBe('moex');
  });

  it('reports failed asset when API returns null', async () => {
    await db.assets.add({
      type: 'Акции',
      ticker: 'UNKNOWN',
      name: 'Unknown Stock',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    });

    (resolveSecurityInfo as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();
    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('saves lastSyncAt timestamp when at least one asset synced', async () => {
    await db.assets.add({
      type: 'Акции', ticker: 'SBER', moexSecid: 'SBER', moexBoardId: 'TQBR', moexMarket: 'shares',
      name: 'Сбербанк', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 300, prevPrice: 298 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();
    expect(result.synced).toBe(1);

    const lastSync = await getLastSyncAt();
    expect(lastSync).not.toBeNull();
  });

  it('does not save lastSyncAt when no assets synced', async () => {
    const result = await syncAllAssets();
    expect(result.synced).toBe(0);

    const lastSync = await getLastSyncAt();
    expect(lastSync).toBeNull();
  });

  it('resolves by ISIN when ticker resolution fails', async () => {
    const assetId = (await db.assets.add({
      type: 'Фонды',
      ticker: 'RU000A1068X9',
      isin: 'RU000A1068X9',
      name: 'ПАРУС-ДВН',
      currentPrice: 1100,
      dataSource: 'import',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        secid: 'RU000A1068X9',
        primaryBoardId: 'TQTF',
        market: 'shares',
      });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['RU000A1068X9', { currentPrice: 1150, prevPrice: 1100 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);
    expect(resolveSecurityInfo).toHaveBeenCalledTimes(2);

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(1150);
    expect(asset!.moexSecid).toBe('RU000A1068X9');
  });

  it('uses cached moexSecid/boardId/market and skips resolveSecurityInfo', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      moexSecid: 'SBER',
      moexBoardId: 'TQBR',
      moexMarket: 'shares',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 320.0, prevPrice: 318.0 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);
    // When all three cached fields are present, resolveSecurityInfo is NOT called
    expect(resolveSecurityInfo).not.toHaveBeenCalled();

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(320.0);
  });

  it('resolves and caches boardId/market when only moexSecid present', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции',
      ticker: 'SBER',
      moexSecid: 'SBER',
      name: 'Сбербанк',
      dataSource: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SBER',
      primaryBoardId: 'TQBR',
      market: 'shares',
    });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 320.0, prevPrice: 318.0 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);
    // Called once because moexBoardId/moexMarket were missing
    expect(resolveSecurityInfo).toHaveBeenCalledTimes(1);
    expect(resolveSecurityInfo).toHaveBeenCalledWith('SBER');

    // Verify boardId and market are now cached
    const asset = await db.assets.get(assetId);
    expect(asset!.moexBoardId).toBe('TQBR');
    expect(asset!.moexMarket).toBe('shares');
  });

  it('writes dividend rows to paymentHistory on stock sync', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'Sber', ticker: 'SBER', moexSecid: 'SBER',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares' });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 300, prevPrice: 298 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 1, nextExpectedCutoffDate: null },
      history: [
        { date: new Date('2024-07-11'), amount: 33.3 },
        { date: new Date('2025-07-18'), amount: 34.84 },
      ],
    });

    await syncAllAssets();

    const records = await db.paymentHistory.where('[assetId+date]').between([assetId, Dexie.minKey], [assetId, Dexie.maxKey]).toArray();
    expect(records).toHaveLength(2);
    expect(records[0].amount).toBe(33.3);
    expect(records[0].type).toBe('dividend');
    expect(records[0].dataSource).toBe('moex');
  });

  it('deduplicates payment history on re-sync', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'Sber', ticker: 'SBER', moexSecid: 'SBER',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    await db.paymentHistory.add({
      assetId, amount: 33.3, date: new Date('2024-07-11'),
      type: 'dividend', dataSource: 'moex',
    });

    (resolveSecurityInfo as Mock).mockResolvedValue({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares' });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 300, prevPrice: 298 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 1, nextExpectedCutoffDate: null },
      history: [
        { date: new Date('2024-07-11'), amount: 33.3 },
        { date: new Date('2025-07-18'), amount: 34.84 },
      ],
    });

    await syncAllAssets();

    const records = await db.paymentHistory.where('[assetId+date]').between([assetId, Dexie.minKey], [assetId, Dexie.maxKey]).toArray();
    expect(records).toHaveLength(2); // not 3
  });

  it('stores separate timestamp for prices-only sync', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'Sber', ticker: 'SBER', moexSecid: 'SBER',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares' });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 300, prevPrice: 298 }]]),
    );

    await syncAllAssets({ pricesOnly: true });

    expect(await getLastPriceSyncAt()).toBeInstanceOf(Date);
    expect(await getLastSyncAt()).toBeNull();
    expect(await db.assets.get(assetId)).toMatchObject({ currentPrice: 300 });
    expect(fetchDividends).not.toHaveBeenCalled();
  });

  it('updates and removes stale source payments without touching manual rows', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'Sber', ticker: 'SBER', moexSecid: 'SBER',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS,
    })) as number;

    await db.paymentHistory.bulkAdd([
      {
        assetId, amount: 33.3, date: new Date('2024-07-11'),
        type: 'dividend', dataSource: 'moex',
      },
      {
        assetId, amount: 10, date: new Date('2023-07-11'),
        type: 'dividend', dataSource: 'moex',
      },
      {
        assetId, amount: 99, date: new Date('2023-07-11'),
        type: 'dividend', dataSource: 'manual',
      },
    ]);

    (resolveSecurityInfo as Mock).mockResolvedValue({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares' });
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 300, prevPrice: 298 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 34.84, lastPaymentDate: new Date('2025-07-18'), frequencyPerYear: 1, nextExpectedCutoffDate: null },
      history: [
        { date: new Date('2024-07-11'), amount: 34.84 },
        { date: new Date('2025-07-18'), amount: 40 },
      ],
    });

    await syncAllAssets();

    const records = await db.paymentHistory
      .where('[assetId+date]')
      .between([assetId, Dexie.minKey], [assetId, Dexie.maxKey])
      .toArray();
    expect(records).toHaveLength(3);
    expect(records.find((r) => r.dataSource === 'moex' && r.date.getTime() === new Date('2024-07-11').getTime())?.amount).toBe(34.84);
    expect(records.some((r) => r.dataSource === 'moex' && r.date.getTime() === new Date('2023-07-11').getTime())).toBe(false);
    expect(records.find((r) => r.dataSource === 'manual')?.amount).toBe(99);
  });

  it('syncs asset with ISIN but no ticker', async () => {
    const assetId = (await db.assets.add({
      type: 'Облигации',
      isin: 'RU000A0JV4Q1',
      name: 'ОФЗ 29010',
      dataSource: 'import',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ASSET_DEFAULTS,
      frequencyPerYear: 2,
    })) as number;

    (resolveSecurityInfo as Mock).mockResolvedValue({
      secid: 'SU29010RMFS4',
      primaryBoardId: 'TQOB',
      market: 'bonds',
    });
    (fetchBatchBondData as Mock).mockResolvedValue(
      new Map([['SU29010RMFS4', {
        currentPrice: 105.5,
        prevPrice: 105.0,
        faceValue: 1000,
        couponValue: 44.88,
        nextCouponDate: '2026-06-18',
        couponPeriod: 182,
      }]]),
    );

    const result = await syncAllAssets();

    expect(result.synced).toBe(1);

    const asset = await db.assets.get(assetId);
    expect(asset!.currentPrice).toBe(1055);
    expect(asset!.moexSecid).toBe('SU29010RMFS4');
  });

  it('groups assets by market+board for batch pricing', async () => {
    // Two stocks on TQBR — should be fetched in one batch
    await db.assets.add({
      type: 'Акции', ticker: 'SBER', moexSecid: 'SBER', moexBoardId: 'TQBR', moexMarket: 'shares',
      name: 'Сбербанк', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });
    await db.assets.add({
      type: 'Акции', ticker: 'GAZP', moexSecid: 'GAZP', moexBoardId: 'TQBR', moexMarket: 'shares',
      name: 'Газпром', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });

    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([
        ['SBER', { currentPrice: 320, prevPrice: 318 }],
        ['GAZP', { currentPrice: 150, prevPrice: 148 }],
      ]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    expect(result.synced).toBe(2);
    expect(resolveSecurityInfo).not.toHaveBeenCalled();
    // Should call fetchBatchStockPrices once (both on TQBR)
    expect(fetchBatchStockPrices).toHaveBeenCalledTimes(1);
    expect((fetchBatchStockPrices as Mock).mock.calls[0][0]).toEqual(
      expect.arrayContaining(['SBER', 'GAZP']),
    );
  });

  it('isolates errors: one asset failing does not block others', async () => {
    await db.assets.add({
      type: 'Акции', ticker: 'GOOD', moexSecid: 'GOOD', moexBoardId: 'TQBR', moexMarket: 'shares',
      name: 'Good Stock', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });
    await db.assets.add({
      type: 'Акции', ticker: 'BAD',
      name: 'Bad Stock', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });

    // BAD fails resolve, GOOD succeeds
    (resolveSecurityInfo as Mock).mockResolvedValue(null);
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['GOOD', { currentPrice: 100, prevPrice: 99 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    // BAD failed at resolve, GOOD should still sync
    expect(result.failed).toBe(1);
    expect(result.synced).toBe(1);
  });

  it('stores both dohod and moex records on same date (different dataSource)', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'LKOH', ticker: 'LKOH', moexSecid: 'LKOH',
      moexBoardId: 'TQBR', moexMarket: 'shares',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencySource: 'moex' as const,
    })) as number;

    await db.paymentHistory.add({
      assetId, amount: 397, date: new Date('2026-01-12'),
      type: 'dividend', dataSource: 'moex',
    });
    await db.paymentHistory.add({
      assetId, amount: 397, date: new Date('2026-01-12'),
      type: 'dividend', dataSource: 'dohod',
    });

    const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
    expect(records).toHaveLength(2);
    expect(records.map(r => r.dataSource).sort()).toEqual(['dohod', 'moex']);
  });

  it('writes only dohod records when dohod available (no moex)', async () => {
    const assetId = (await db.assets.add({
      type: 'Акции', name: 'LKOH', ticker: 'LKOH', moexSecid: 'LKOH',
      moexBoardId: 'TQBR', moexMarket: 'shares',
      dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencySource: 'moex' as const,
    })) as number;

    (isDohodAvailable as Mock).mockResolvedValue(true);
    (fetchDohodDividends as Mock).mockResolvedValue([
      { date: new Date('2026-01-12'), amount: 397, isForecast: false },
      { date: new Date('2026-05-04'), amount: 278, isForecast: true },
    ]);
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['LKOH', { currentPrice: 7000, prevPrice: 6900 }]]),
    );

    await syncAllAssets();

    const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
    // Only dohod: 1 fact + 1 forecast, no moex
    expect(records).toHaveLength(2);
    expect(records.every(r => r.dataSource === 'dohod')).toBe(true);
    expect(records.filter(r => r.isForecast)).toHaveLength(1);
    // fetchDividends should NOT have been called (dohod available)
    expect(fetchDividends).not.toHaveBeenCalled();
  });

  it('writes fund distributions from heroincome-data with type distribution', async () => {
    const assetId = (await db.assets.add({
      type: 'Фонды', name: 'PLZ5', ticker: 'PLZ5', isin: 'RU000A1022Z1',
      moexSecid: 'PLZ5', moexBoardId: 'TQPI', moexMarket: 'shares',
      dataSource: 'import', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencyPerYear: 12, frequencySource: 'moex' as const,
    })) as number;

    (findFundKey as Mock).mockResolvedValue('PLZ5');
    (fetchFundDistributions as Mock).mockResolvedValue([
      { date: new Date('2026-02-27'), amount: 72.45 },
      { date: new Date('2026-01-30'), amount: 68.9 },
    ]);
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['PLZ5', { currentPrice: 8100, prevPrice: 8050 }]]),
    );

    await syncAllAssets();

    const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
    expect(records).toHaveLength(2);
    expect(records.every(r => r.type === 'distribution')).toBe(true);
    expect(records.every(r => r.dataSource === 'parus')).toBe(true);
    expect(records.every(r => !r.isForecast)).toBe(true);
    expect(fetchDividends).not.toHaveBeenCalled();
    expect(isDohodAvailable).not.toHaveBeenCalled();
    // The fund is looked up by every code it has, the MOEX one included.
    expect(findFundKey).toHaveBeenCalledWith('PLZ5', 'RU000A1022Z1', 'PLZ5');
  });

  it('falls back to MOEX when fund not in heroincome-data', async () => {
    const assetId = (await db.assets.add({
      type: 'Фонды', name: 'SBMX', ticker: 'SBMX',
      moexSecid: 'SBMX', moexBoardId: 'TQTF', moexMarket: 'shares',
      dataSource: 'import', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencyPerYear: 12,
    })) as number;

    (findFundKey as Mock).mockResolvedValue(null);
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBMX', { currentPrice: 20, prevPrice: 19.8 }]]),
    );
    (fetchDividends as Mock).mockResolvedValue({
      summary: { lastPaymentAmount: 0.5, lastPaymentDate: new Date('2025-12-15'), frequencyPerYear: 4, nextExpectedCutoffDate: null },
      history: [{ date: new Date('2025-12-15'), amount: 0.5 }],
    });

    await syncAllAssets();

    const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
    expect(records).toHaveLength(1);
    expect(records[0].type).toBe('distribution');
    expect(records[0].dataSource).toBe('moex');
  });

  it('deletes old moex distribution records when heroincome-data covers a fund', async () => {
    const assetId = (await db.assets.add({
      type: 'Фонды', name: 'PLZ5', ticker: 'PLZ5',
      moexSecid: 'PLZ5', moexBoardId: 'TQPI', moexMarket: 'shares',
      dataSource: 'import', createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencyPerYear: 12, frequencySource: 'moex' as const,
    })) as number;

    // Pre-existing moex distribution
    await db.paymentHistory.add({
      assetId, amount: 60.0, date: new Date('2025-07-15'),
      type: 'distribution', dataSource: 'moex',
    });

    (findFundKey as Mock).mockResolvedValue('PLZ5');
    (fetchFundDistributions as Mock).mockResolvedValue([
      { date: new Date('2026-02-27'), amount: 72.45 },
    ]);
    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['PLZ5', { currentPrice: 8100, prevPrice: 8050 }]]),
    );

    await syncAllAssets();

    const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
    // Old moex record deleted, only parus record remains
    expect(records).toHaveLength(1);
    expect(records[0].dataSource).toBe('parus');
    expect(records[0].amount).toBe(72.45);
  });

  it('writes the prices of all securities at once, so the screens recalculate once', async () => {
    for (const ticker of ['SBER', 'LKOH', 'MTSS']) {
      await db.assets.add({
        type: 'Акции', name: ticker, ticker, moexSecid: ticker, moexBoardId: 'TQBR', moexMarket: 'shares',
        dataSource: 'moex', createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
      });
    }
    (fetchBatchStockPrices as Mock).mockResolvedValue(new Map([
      ['SBER', { currentPrice: 300, prevPrice: 299 }],
      ['LKOH', { currentPrice: 7000, prevPrice: 6900 }],
      ['MTSS', { currentPrice: null, prevPrice: 228 }],
    ]));

    // What a screen sees: every emission of the live query is one recalculation of the portfolio.
    const seen: (number | undefined)[][] = [];
    const subscription = liveQuery(() => db.assets.toArray()).subscribe((assets) => {
      seen.push(assets.map((a) => a.currentPrice));
    });
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    const result = await syncAllAssets({ pricesOnly: true });
    await vi.waitFor(() => expect(seen[seen.length - 1]).toEqual([300, 7000, 228]));
    await new Promise((resolve) => setTimeout(resolve, 30));
    subscription.unsubscribe();

    expect(result.synced).toBe(3);
    expect(seen).toEqual([[undefined, undefined, undefined], [300, 7000, 228]]);
  });

  describe('one payment source per security', () => {
    const LKOH = {
      type: 'Акции', name: 'LKOH', ticker: 'LKOH', moexSecid: 'LKOH',
      moexBoardId: 'TQBR', moexMarket: 'shares' as const,
      dataSource: 'moex' as const, createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencySource: 'moex' as const,
    };
    const PLZ5 = {
      type: 'Фонды', name: 'PLZ5', ticker: 'PLZ5', isin: 'RU000A1022Z1',
      moexSecid: 'PLZ5', moexBoardId: 'TQPI', moexMarket: 'shares' as const,
      dataSource: 'import' as const, createdAt: new Date(), updatedAt: new Date(),
      ...ASSET_DEFAULTS, frequencyPerYear: 12, frequencySource: 'moex' as const,
    };
    const moexDividends = {
      summary: { lastPaymentAmount: 397, lastPaymentDate: new Date('2026-01-12'), frequencyPerYear: 2, nextExpectedCutoffDate: null },
      history: [
        { date: new Date('2025-06-03'), amount: 541 },
        { date: new Date('2026-01-12'), amount: 397 },
      ],
    };

    beforeEach(() => {
      (fetchBatchStockPrices as Mock).mockResolvedValue(new Map());
      (fetchDividends as Mock).mockResolvedValue(moexDividends);
      (isDohodAvailable as Mock).mockResolvedValue(false);
      (fetchDohodDividends as Mock).mockResolvedValue(null);
      (isDohodIndexLoaded as Mock).mockResolvedValue(true);
      (findFundKey as Mock).mockResolvedValue(null);
      (fetchFundDistributions as Mock).mockResolvedValue(null);
      (isFundIndexLoaded as Mock).mockResolvedValue(true);
    });

    it('keeps dohod dividends and adds no MOEX rows when the dohod index is unreachable', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      await db.paymentHistory.bulkAdd([
        { assetId, amount: 541, date: new Date('2025-06-03'), type: 'dividend', dataSource: 'dohod' },
        { assetId, amount: 397, date: new Date('2026-01-12'), type: 'dividend', dataSource: 'dohod' },
      ]);
      (isDohodIndexLoaded as Mock).mockResolvedValue(false);

      await syncAllAssets();

      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records.map((r) => r.dataSource)).toEqual(['dohod', 'dohod']);
      expect(fetchDividends).not.toHaveBeenCalled();
    });

    it('keeps dohod dividends when the ticker file fails to load', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      await db.paymentHistory.add({ assetId, amount: 397, date: new Date('2026-01-12'), type: 'dividend', dataSource: 'dohod' });
      (isDohodAvailable as Mock).mockResolvedValue(true);
      (fetchDohodDividends as Mock).mockResolvedValue(null);

      await syncAllAssets();

      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records).toHaveLength(1);
      expect(records[0].dataSource).toBe('dohod');
    });

    it('replaces dohod rows with MOEX ones once dohod no longer lists the ticker', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      await db.paymentHistory.add({ assetId, amount: 397, date: new Date('2026-01-12'), type: 'dividend', dataSource: 'dohod' });

      await syncAllAssets();

      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records).toHaveLength(2);
      expect(records.every((r) => r.dataSource === 'moex')).toBe(true);
    });

    it('keeps dohod rows when dohod dropped the ticker but MOEX has nothing either', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      await db.paymentHistory.add({ assetId, amount: 397, date: new Date('2026-01-12'), type: 'dividend', dataSource: 'dohod' });
      (fetchDividends as Mock).mockResolvedValue(null);

      await syncAllAssets();

      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records).toHaveLength(1);
      expect(records[0].dataSource).toBe('dohod');
    });

    it('uses MOEX for a new stock while dohod is unreachable, then switches to dohod', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      (isDohodIndexLoaded as Mock).mockResolvedValue(false);

      await syncAllAssets();
      let records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records.map((r) => r.dataSource)).toEqual(['moex', 'moex']);

      (isDohodIndexLoaded as Mock).mockResolvedValue(true);
      (isDohodAvailable as Mock).mockResolvedValue(true);
      (fetchDohodDividends as Mock).mockResolvedValue([
        { date: new Date('2025-06-03'), amount: 541, isForecast: false },
        { date: new Date('2026-01-12'), amount: 397, isForecast: false },
      ]);

      await syncAllAssets();
      records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records.map((r) => r.dataSource)).toEqual(['dohod', 'dohod']);
    });

    it('keeps Parus distributions and adds no MOEX rows when the fund index is unreachable', async () => {
      const assetId = (await db.assets.add(PLZ5)) as number;
      await db.paymentHistory.add({ assetId, amount: 72.45, date: new Date('2026-02-27'), type: 'distribution', dataSource: 'parus' });
      (isFundIndexLoaded as Mock).mockResolvedValue(false);
      (fetchDividends as Mock).mockResolvedValue({
        summary: { lastPaymentAmount: 72.45, lastPaymentDate: new Date('2026-02-27'), frequencyPerYear: 12, nextExpectedCutoffDate: null },
        history: [{ date: new Date('2026-02-27'), amount: 72.45 }],
      });

      await syncAllAssets();

      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records).toHaveLength(1);
      expect(records[0].dataSource).toBe('parus');
      expect(fetchDividends).not.toHaveBeenCalled();
    });

    it('per-asset payment sync follows the same rule', async () => {
      const assetId = (await db.assets.add(LKOH)) as number;
      await db.paymentHistory.add({ assetId, amount: 397, date: new Date('2026-01-12'), type: 'dividend', dataSource: 'dohod' });
      (isDohodIndexLoaded as Mock).mockResolvedValue(false);

      const result = await syncAssetPayments(assetId);

      expect(result.success).toBe(true);
      const records = await db.paymentHistory.where('assetId').equals(assetId).toArray();
      expect(records).toHaveLength(1);
      expect(records[0].dataSource).toBe('dohod');
    });
  });

  it('handles mixed stock+bond portfolio', async () => {
    await db.assets.add({
      type: 'Акции', ticker: 'SBER', moexSecid: 'SBER', moexBoardId: 'TQBR', moexMarket: 'shares',
      name: 'Сбербанк', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });
    await db.assets.add({
      type: 'Облигации', ticker: 'SU26238RMFS4', moexSecid: 'SU26238RMFS4', moexBoardId: 'TQOB', moexMarket: 'bonds',
      name: 'ОФЗ 26238', dataSource: 'manual',
      createdAt: new Date(), updatedAt: new Date(), ...ASSET_DEFAULTS,
    });

    (fetchBatchStockPrices as Mock).mockResolvedValue(
      new Map([['SBER', { currentPrice: 320, prevPrice: 318 }]]),
    );
    (fetchBatchBondData as Mock).mockResolvedValue(
      new Map([['SU26238RMFS4', {
        currentPrice: 61.5, prevPrice: 61.107,
        faceValue: 1000, couponValue: 35.4,
        nextCouponDate: '2026-06-03', couponPeriod: 182,
      }]]),
    );
    (fetchDividends as Mock).mockResolvedValue(null);

    const result = await syncAllAssets();

    expect(result.synced).toBe(2);
    expect(fetchBatchStockPrices).toHaveBeenCalledTimes(1);
    expect(fetchBatchBondData).toHaveBeenCalledTimes(1);
  });
});
