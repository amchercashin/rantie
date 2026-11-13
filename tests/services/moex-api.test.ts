// @vitest-environment node
import { describe, it, expect, vi, afterEach, onTestFinished } from 'vitest';
import {
  parseISSBlock,
  calcDividendFrequency,
  parseDividendHistory,
  resolveSecurityInfo,
  resolveSecurityFull,
  fetchStockPrice,
  fetchBondData,
  fetchDividends,
  fetchCouponHistory,
  couponRows,
  chunk,
  fetchBatchStockPrices,
  fetchBatchBondData,
  parseIndicativeRates,
} from '@/services/moex-api';

describe('parseISSBlock', () => {
  it('converts ISS columns+data to array of objects', () => {
    const block = {
      columns: ['secid', 'value', 'date'],
      data: [
        ['SBER', 33.3, '2024-07-11'],
        ['SBER', 34.84, '2025-07-18'],
      ],
    };
    expect(parseISSBlock(block)).toEqual([
      { secid: 'SBER', value: 33.3, date: '2024-07-11' },
      { secid: 'SBER', value: 34.84, date: '2025-07-18' },
    ]);
  });

  it('returns empty array for empty data', () => {
    expect(parseISSBlock({ columns: ['a'], data: [] })).toEqual([]);
  });
});

describe('calcDividendFrequency', () => {
  it('detects annual frequency (~365 day intervals)', () => {
    const dates = [
      new Date('2022-07-01'),
      new Date('2023-06-28'),
      new Date('2024-07-03'),
    ];
    expect(calcDividendFrequency(dates)).toBe(1);
  });

  it('detects semi-annual frequency (~180 day intervals)', () => {
    const dates = [
      new Date('2024-01-15'),
      new Date('2024-07-10'),
      new Date('2025-01-12'),
      new Date('2025-07-14'),
    ];
    expect(calcDividendFrequency(dates)).toBe(2);
  });

  it('detects quarterly frequency (~90 day intervals)', () => {
    const dates = [
      new Date('2024-01-15'),
      new Date('2024-04-12'),
      new Date('2024-07-15'),
      new Date('2024-10-14'),
    ];
    expect(calcDividendFrequency(dates)).toBe(4);
  });

  it('returns 1 for single payment date', () => {
    expect(calcDividendFrequency([new Date('2024-07-01')])).toBe(1);
  });

  it('takes payments within a few days of each other for one payout', () => {
    // Two dividends with one record date (ФосАгро 11.07.2024) are not a 0-day interval.
    const dates = [
      new Date('2024-01-10'),
      new Date('2024-07-11'),
      new Date('2024-07-11'),
      new Date('2025-01-10'),
      new Date('2025-07-10'),
      new Date('2025-07-12'),
    ];
    expect(calcDividendFrequency(dates)).toBe(2);
  });

  it('returns 1 when all payments fall on one date', () => {
    expect(calcDividendFrequency([new Date('2024-07-11'), new Date('2024-07-11')])).toBe(1);
  });
});

describe('parseDividendHistory', () => {
  const today = new Date('2026-03-15');

  it('extracts last payment and annual frequency', () => {
    const rows = [
      { registryclosedate: '2023-05-11', value: 25.0 },
      { registryclosedate: '2024-07-11', value: 33.3 },
      { registryclosedate: '2025-07-18', value: 34.84 },
    ];
    const result = parseDividendHistory(rows, today);
    expect(result).not.toBeNull();
    expect(result!.lastPaymentAmount).toBe(34.84);
    expect(result!.lastPaymentDate).toEqual(new Date('2025-07-18'));
    expect(result!.frequencyPerYear).toBe(1);
    expect(result!.nextExpectedCutoffDate).toBeNull();
  });

  it('detects announced future dividend as nextExpectedCutoffDate', () => {
    const rows = [
      { registryclosedate: '2024-07-11', value: 33.3 },
      { registryclosedate: '2025-07-18', value: 34.84 },
      { registryclosedate: '2026-07-20', value: 36.0 },
    ];
    const result = parseDividendHistory(rows, today);
    expect(result!.lastPaymentAmount).toBe(34.84);
    expect(result!.nextExpectedCutoffDate).toEqual(new Date('2026-07-20'));
  });

  it('returns null for empty history', () => {
    expect(parseDividendHistory([], today)).toBeNull();
  });

  it('returns null when no past payments exist', () => {
    const rows = [{ registryclosedate: '2027-01-01', value: 10.0 }];
    expect(parseDividendHistory(rows, today)).toBeNull();
  });

  it('skips rows with null value', () => {
    const rows = [
      { registryclosedate: '2024-07-11', value: null },
      { registryclosedate: '2025-07-18', value: 34.84 },
    ];
    const result = parseDividendHistory(rows, today);
    expect(result!.lastPaymentAmount).toBe(34.84);
    expect(result!.frequencyPerYear).toBe(1);
  });
});

function mockFetch(body: object) {
  return vi
    .fn()
    .mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
}

describe('resolveSecurityInfo', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves stock ticker to TQBR/shares', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'primary_boardid', 'group', 'is_traded'],
        data: [
          ['FIXSBER', 'INPF', 'stock_index', 1],
          ['SBER', 'TQBR', 'stock_shares', 1],
        ],
      },
    }));
    const result = await resolveSecurityInfo('SBER');
    expect(result).toEqual({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares' });
  });

  it('returns the MOEX short name when present', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'shortname', 'primary_boardid', 'group', 'is_traded'],
        data: [['SBER', 'Сбербанк', 'TQBR', 'stock_shares', 1]],
      },
    }));
    const result = await resolveSecurityInfo('SBER');
    expect(result).toEqual({ secid: 'SBER', primaryBoardId: 'TQBR', market: 'shares', shortName: 'Сбербанк' });
  });

  it('resolves bond ticker to TQOB/bonds', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'primary_boardid', 'group', 'is_traded'],
        data: [['SU26238RMFS4', 'TQOB', 'stock_bonds', 1]],
      },
    }));
    const result = await resolveSecurityInfo('SU26238RMFS4');
    expect(result).toEqual({ secid: 'SU26238RMFS4', primaryBoardId: 'TQOB', market: 'bonds' });
  });

  it('returns null for unknown ticker', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: { columns: ['secid', 'primary_boardid', 'group', 'is_traded'], data: [] },
    }));
    expect(await resolveSecurityInfo('XXXXX')).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    expect(await resolveSecurityInfo('SBER')).toBeNull();
  });

  it('returns null for unsupported board', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'primary_boardid', 'group', 'is_traded'],
        data: [['THING', 'XXXX', 'currency_metal', 1]],
      },
    }));
    expect(await resolveSecurityInfo('THING')).toBeNull();
  });

  it('resolves by ISIN when secid differs from query', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'primary_boardid', 'group', 'is_traded'],
        data: [['SU29010RMFS4', 'TQOB', 'government_bond', 1]],
      },
    }));
    const result = await resolveSecurityInfo('RU000A0JV4Q1');
    expect(result).toEqual({
      secid: 'SU29010RMFS4',
      primaryBoardId: 'TQOB',
      market: 'bonds',
    });
  });

  it('prefers exact secid match over first traded result', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'primary_boardid', 'group', 'is_traded'],
        data: [
          ['WRONG', 'TQBR', 'stock_shares', 1],
          ['SBER', 'TQBR', 'stock_shares', 1],
        ],
      },
    }));
    const result = await resolveSecurityInfo('SBER');
    expect(result!.secid).toBe('SBER');
  });
});

describe('fetchStockPrice', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns LAST price when available', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', 316.65]] },
      marketdata: { columns: ['SECID', 'LAST', 'LCURRENTPRICE'], data: [['SBER', 317.63, 317.54]] },
    }));
    const result = await fetchStockPrice('SBER', 'TQBR');
    expect(result).toEqual({ currentPrice: 317.63, prevPrice: 316.65 });
  });

  it('falls back to LCURRENTPRICE when LAST is null', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: { columns: ['SECID', 'PREVPRICE'], data: [['SBER', 316.65]] },
      marketdata: { columns: ['SECID', 'LAST', 'LCURRENTPRICE'], data: [['SBER', null, 317.54]] },
    }));
    const result = await fetchStockPrice('SBER', 'TQBR');
    expect(result!.currentPrice).toBe(317.54);
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await fetchStockPrice('SBER', 'TQBR')).toBeNull();
  });
});

describe('fetchBondData', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns bond price and coupon info', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['SECID', 'PREVPRICE', 'FACEVALUE', 'ACCRUEDINT', 'COUPONVALUE', 'NEXTCOUPON', 'COUPONPERIOD'],
        data: [['SU26238RMFS4', 61.107, 1000, 23.45, 35.4, '2026-06-03', 182]],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'LCURRENTPRICE'],
        data: [['SU26238RMFS4', 61.5, null]],
      },
    }));
    const result = await fetchBondData('SU26238RMFS4', 'TQOB');
    expect(result).toEqual({
      currentPrice: 61.5, prevPrice: 61.107,
      faceValue: 1000, accruedInterest: 23.45, couponValue: 35.4,
      nextCouponDate: '2026-06-03', couponPeriod: 182,
    });
  });

  it('returns null on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await fetchBondData('SU26238RMFS4', 'TQOB')).toBeNull();
  });
});

describe('fetchDividends', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches and parses dividend history', async () => {
    vi.stubGlobal('fetch', mockFetch({
      dividends: {
        columns: ['secid', 'isin', 'registryclosedate', 'value', 'currencyid'],
        data: [
          ['SBER', 'RU0009029540', '2024-07-11', 33.3, 'RUB'],
          ['SBER', 'RU0009029540', '2025-07-18', 34.84, 'RUB'],
        ],
      },
    }));
    const result = await fetchDividends('SBER');
    expect(result).not.toBeNull();
    expect(result!.summary.lastPaymentAmount).toBe(34.84);
    expect(result!.summary.frequencyPerYear).toBe(1);
  });

  it('returns null for empty dividend list', async () => {
    vi.stubGlobal('fetch', mockFetch({
      dividends: { columns: ['secid', 'registryclosedate', 'value', 'currencyid'], data: [] },
    }));
    expect(await fetchDividends('SBER')).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await fetchDividends('SBER')).toBeNull();
  });
});

describe('fetchDividends (no pagination)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('fetches all dividends in a single request', async () => {
    const columns = ['secid', 'isin', 'registryclosedate', 'value', 'currencyid'];
    const data = Array.from({ length: 25 }, (_, i) => [
      'LKOH', 'RU0009024277', `${2000 + i}-07-01`, 50 + i, 'RUB',
    ]);

    const fetchMock = mockFetch({ dividends: { columns, data } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchDividends('LKOH');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result!.history).toHaveLength(25);
  });
});

describe('fetchDividends (with raw rows)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns both summary and raw history rows', async () => {
    vi.stubGlobal('fetch', mockFetch({
      dividends: {
        columns: ['secid', 'isin', 'registryclosedate', 'value', 'currencyid'],
        data: [
          ['SBER', 'RU0009029540', '2024-07-11', 33.3, 'RUB'],
          ['SBER', 'RU0009029540', '2025-07-18', 34.84, 'RUB'],
        ],
      },
    }));
    const result = await fetchDividends('SBER');
    expect(result).not.toBeNull();
    expect(result!.summary.lastPaymentAmount).toBe(34.84);
    expect(result!.history).toHaveLength(2);
    expect(result!.history[0]).toEqual({ date: new Date('2024-07-11'), amount: 33.3 });
    expect(result!.history[1]).toEqual({ date: new Date('2025-07-18'), amount: 34.84 });
  });
});

describe('fetchCouponHistory', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns coupon payment history from bondization endpoint', async () => {
    vi.stubGlobal('fetch', mockFetch({
      coupons: {
        columns: ['isin', 'coupondate', 'value_rub', 'value'],
        data: [
          ['RU000A0JV4Q1', '2025-06-03', 35.4, 35.4],
          ['RU000A0JV4Q1', '2025-12-03', 35.4, 35.4],
          ['RU000A0JV4Q1', '2026-06-03', null, null],
        ],
      },
    }));
    const result = await fetchCouponHistory('SU26238RMFS4');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: new Date('2025-06-03'), amount: 35.4 });
  });

  it('paginates through all coupon pages', async () => {
    // Pin "today" so the 2026+ coupons in the fixture stay in the future.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-15'));
    onTestFinished(() => { vi.useRealTimers(); });
    // Page 1: exactly 20 rows (triggers next page fetch)
    const page1Data = Array.from({ length: 20 }, (_, i) => [
      'RU000A0JV4Q1',
      `2015-${String((i % 12) + 1).padStart(2, '0')}-01`,
      10 + i,
      10 + i,
    ]);
    // Page 2: 5 rows including recent ones
    const page2Data = [
      ['RU000A0JV4Q1', '2025-06-18', 99.33, 99.33],
      ['RU000A0JV4Q1', '2025-12-17', 112.24, 112.24],
      ['RU000A0JV4Q1', '2026-06-17', 50, 50],
      ['RU000A0JV4Q1', '2026-12-16', 50, 50],
      ['RU000A0JV4Q1', '2027-06-16', 50, 50],
    ];
    const columns = ['isin', 'coupondate', 'value_rub', 'value'];

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coupons: { columns, data: page1Data } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ coupons: { columns, data: page2Data } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchCouponHistory('SU29010RMFS4');
    // Should have fetched 2 pages
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 20 past page1 coupons + 2 past 2025 coupons + the 3 coupons ahead within 18 months
    expect(result.length).toBe(25);
    // Recent coupons from page 2 should be present
    expect(result.some(r => r.amount === 99.33)).toBe(true);
    expect(result.some(r => r.amount === 112.24)).toBe(true);
    expect(result.filter(r => r.isForecast).map(r => r.date)).toEqual([new Date('2026-12-16'), new Date('2027-06-16')]);
  });

  it('returns empty array on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    expect(await fetchCouponHistory('SU26238RMFS4')).toEqual([]);
  });
});

describe('couponRows', () => {
  const row = (coupondate: string, value_rub: number | null) => ({ coupondate, value_rub });
  const now = new Date('2026-11-13T07:00:00Z');

  it('keeps the fixed coupon of the current period as a real payment and later ones as forecasts', () => {
    // ОФЗ 29010: the December coupon is fixed (НКД is counted from it), later ones are MOEX's placeholder.
    const result = couponRows([
      row('2027-06-16', 82.72),
      row('2025-12-17', 112.24),
      row('2026-06-17', 95.44),
      row('2026-12-16', 82.72),
      row('2027-12-15', 82.72),
      row('2028-06-14', 82.72),
    ], now);
    expect(result).toEqual([
      { date: new Date('2025-12-17'), amount: 112.24 },
      { date: new Date('2026-06-17'), amount: 95.44 },
      { date: new Date('2026-12-16'), amount: 82.72 },
      { date: new Date('2027-06-16'), amount: 82.72, isForecast: true },
      { date: new Date('2027-12-15'), amount: 82.72, isForecast: true },
      // 2028-06-14 is more than 18 months ahead
    ]);
  });

  it('skips coupons MOEX does not know yet, the current one included', () => {
    // A RUONIA floater before its fixing: no amount for the current period and after it.
    expect(couponRows([
      row('2026-08-26', 35.15),
      row('2026-11-25', null),
      row('2027-02-24', null),
    ], now)).toEqual([{ date: new Date('2026-08-26'), amount: 35.15 }]);
  });

  it('does not promote a later coupon to a real one when the nearest is unknown', () => {
    const result = couponRows([row('2026-11-25', null), row('2027-02-24', 30)], now);
    expect(result).toEqual([{ date: new Date('2027-02-24'), amount: 30, isForecast: true }]);
  });

  it('counts a coupon dated today as paid', () => {
    expect(couponRows([row('2026-11-13', 40), row('2027-05-13', 40)], now)).toEqual([
      { date: new Date('2026-11-13'), amount: 40 },
      { date: new Date('2027-05-13'), amount: 40 },
    ]);
  });
});

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when array fits', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 5)).toEqual([]);
  });
});

describe('fetchBatchStockPrices', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns Map of prices for multiple tickers', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['SECID', 'PREVPRICE'],
        data: [['SBER', 316.65], ['GAZP', 150.2]],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'LCURRENTPRICE'],
        data: [['SBER', 317.63, 317.54], ['GAZP', 151.0, 150.8]],
      },
    }));
    const result = await fetchBatchStockPrices(['SBER', 'GAZP'], 'TQBR');
    expect(result.size).toBe(2);
    expect(result.get('SBER')).toEqual({ currentPrice: 317.63, prevPrice: 316.65 });
    expect(result.get('GAZP')).toEqual({ currentPrice: 151.0, prevPrice: 150.2 });
  });

  it('handles partial results (API returns fewer tickers)', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['SECID', 'PREVPRICE'],
        data: [['SBER', 316.65]],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'LCURRENTPRICE'],
        data: [['SBER', 317.63, 317.54]],
      },
    }));
    const result = await fetchBatchStockPrices(['SBER', 'MISSING'], 'TQBR');
    expect(result.size).toBe(1);
    expect(result.has('SBER')).toBe(true);
    expect(result.has('MISSING')).toBe(false);
  });

  it('returns empty Map on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchBatchStockPrices(['SBER'], 'TQBR');
    expect(result.size).toBe(0);
  });

  it('returns empty Map for empty secids', async () => {
    const result = await fetchBatchStockPrices([], 'TQBR');
    expect(result.size).toBe(0);
  });
});

describe('fetchBatchBondData', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns Map of bond data for multiple tickers', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['SECID', 'PREVPRICE', 'FACEVALUE', 'ACCRUEDINT', 'COUPONVALUE', 'NEXTCOUPON', 'COUPONPERIOD'],
        data: [
          ['SU26238RMFS4', 61.107, 1000, 23.45, 35.4, '2026-06-03', 182],
          ['SU29010RMFS4', 105.0, 1000, 12.5, 44.88, '2026-06-18', 182],
        ],
      },
      marketdata: {
        columns: ['SECID', 'LAST', 'LCURRENTPRICE'],
        data: [
          ['SU26238RMFS4', 61.5, null],
          ['SU29010RMFS4', 105.5, null],
        ],
      },
    }));
    const result = await fetchBatchBondData(['SU26238RMFS4', 'SU29010RMFS4'], 'TQOB');
    expect(result.size).toBe(2);
    expect(result.get('SU26238RMFS4')).toEqual({
      currentPrice: 61.5, prevPrice: 61.107,
      faceValue: 1000, accruedInterest: 23.45, couponValue: 35.4,
      nextCouponDate: '2026-06-03', couponPeriod: 182,
    });
    expect(result.get('SU29010RMFS4')!.currentPrice).toBe(105.5);
  });

  it('returns empty Map on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
    const result = await fetchBatchBondData(['SU26238RMFS4'], 'TQOB');
    expect(result.size).toBe(0);
  });
});

describe('resolveSecurityFull', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves ISIN to full security info', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'shortname', 'name', 'isin', 'primary_boardid', 'group', 'type', 'emitent_title', 'is_traded'],
        data: [
          ['GAZP', 'Газпром', 'ПАО "Газпром"', 'RU0007661625', 'TQBR', 'stock_shares', 'common_share', 'ПАО "Газпром"', 1],
        ],
      },
    }));
    const result = await resolveSecurityFull('RU0007661625');
    expect(result).toEqual({
      secid: 'GAZP',
      primaryBoardId: 'TQBR',
      market: 'shares',
      shortName: 'Газпром',
      fullName: 'ПАО "Газпром"',
      isin: 'RU0007661625',
      secType: 'common_share',
      emitter: 'ПАО "Газпром"',
    });
  });

  it('resolves fund on TQTF board', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'shortname', 'name', 'isin', 'primary_boardid', 'group', 'type', 'emitent_title', 'is_traded'],
        data: [
          ['TMOS', 'Тинькофф iMOEX', 'БПИФ "Тинькофф Индекс МосБиржи"', 'RU000A101X76', 'TQTF', 'stock_shares', 'exchange_ppif', 'Тинькофф Капитал', 1],
        ],
      },
    }));
    const result = await resolveSecurityFull('RU000A101X76');
    expect(result).toEqual({
      secid: 'TMOS',
      primaryBoardId: 'TQTF',
      market: 'shares',
      shortName: 'Тинькофф iMOEX',
      fullName: 'БПИФ "Тинькофф Индекс МосБиржи"',
      isin: 'RU000A101X76',
      secType: 'exchange_ppif',
      emitter: 'Тинькофф Капитал',
    });
  });

  it('returns null for unknown ISIN', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: { columns: ['secid', 'shortname', 'name', 'isin', 'primary_boardid', 'group', 'type', 'emitent_title', 'is_traded'], data: [] },
    }));
    expect(await resolveSecurityFull('RU000XXXXXXX')).toBeNull();
  });

  it('returns null for unrecognized board', async () => {
    vi.stubGlobal('fetch', mockFetch({
      securities: {
        columns: ['secid', 'shortname', 'name', 'isin', 'primary_boardid', 'group', 'type', 'emitent_title', 'is_traded'],
        data: [
          ['XYZZ', 'Unknown', 'Unknown Corp', 'RU000XYZZ', 'ZZZZ', 'unknown_group', 'unknown_type', 'Emitter', 1],
        ],
      },
    }));
    expect(await resolveSecurityFull('RU000XYZZ')).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await resolveSecurityFull('GAZP')).toBeNull();
  });
});

describe('fetchISS signal passing', () => {
  afterEach(() => vi.restoreAllMocks());

  it('passes AbortSignal.timeout to fetch by default', async () => {
    const fetchMock = mockFetch({
      securities: { columns: ['secid', 'primary_boardid', 'group', 'is_traded'], data: [] },
    });
    vi.stubGlobal('fetch', fetchMock);
    await resolveSecurityInfo('SBER');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[1]).toHaveProperty('signal');
  });
});

describe('parseIndicativeRates', () => {
  it('takes the latest clearing rate of each X/RUB pair', () => {
    const json = {
      securities: {
        columns: ['tradedate', 'tradetime', 'secid', 'rate', 'clearing'],
        data: [
          ['2026-11-10', '14:00:00', 'CNY/RUB', 12.3908, 'tc'],
          ['2026-11-10', '19:00:00', 'CNY/RUB', 12.421, 'mc'],
          ['2026-11-10', '19:00:00', 'USD/RUB', 82.5486, 'mc'],
          ['2026-11-10', '14:00:00', 'USD/RUB', 82.7536, 'tc'],
          ['2026-11-09', '19:00:00', 'EUR/RUB', 91.1, 'mc'],
          ['2026-11-10', '14:00:00', 'EUR/RUB', 92.3944, 'tc'],
          ['2026-11-10', '14:00:00', 'EUR/USD', 1.12, 'tc'],
          ['2026-11-10', '14:00:00', 'GBP/RUB', 0, 'tc'],
          ['2026-11-10', '14:00:00', 'JPY/RUB', null, 'tc'],
        ],
      },
    };

    expect(parseIndicativeRates(json)).toEqual(new Map([
      ['CNY', 12.421],
      ['USD', 82.5486],
      ['EUR', 92.3944],
    ]));
  });

  it('returns an empty map for a response without the block', () => {
    expect(parseIndicativeRates({})).toEqual(new Map());
    expect(parseIndicativeRates(null)).toEqual(new Map());
  });
});

