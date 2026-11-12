import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  fetchDohodDividends,
  isDohodAvailable,
  fetchSmartlabDividends,
  isSmartlabAvailable,
  isSmartlabIndexLoaded,
  resetDohodCache,
  findFundKey,
  fetchFundDistributions,
} from '@/services/heroincome-data';

const MOCK_INDEX = {
  updatedAt: '2026-03-31T14:22:20Z',
  tickersCount: 3,
  tickers: ['LKOH', 'SBER', 'GAZP'],
};

const MOCK_LKOH = {
  ticker: 'LKOH',
  scrapedAt: '2026-03-31T14:22:20Z',
  source: 'dohod.ru',
  payments: [
    { recordDate: '2026-01-12', declaredDate: '2025-11-21', amount: 397.0, year: 2025, isForecast: false },
    { recordDate: '2026-05-04', declaredDate: null, amount: 278.0, year: null, isForecast: true },
    { recordDate: '2025-06-10', declaredDate: '2025-04-01', amount: null, year: 2024, isForecast: false },
  ],
};

const MOCK_FUND_INDEX = {
  updatedAt: '2026-04-03T06:52:41Z',
  fundsCount: 2,
  funds: ['PLZ5', 'RU000A1068X9'],
};

const MOCK_PLZ5_DISTRIBUTIONS = {
  isin: 'RU000A1022Z1',
  ticker: 'PLZ5',
  name: 'ПАРУС-ОЗН',
  managementCompany: 'Parus',
  scrapedAt: '2026-04-03T06:52:38Z',
  distributions: [
    {
      paymentDate: '2026-03-13',
      recordDate: '2026-02-27',
      unitPrice: 8100.0,
      amountBeforeTax: 72.45,
      amountAfterTax: 63.03,
      yieldPrc: 10.7,
      status: 'paid',
    },
    {
      paymentDate: '2026-02-12',
      recordDate: '2026-01-30',
      unitPrice: 8100.0,
      amountBeforeTax: 68.9,
      amountAfterTax: 59.94,
      yieldPrc: 10.2,
      status: 'paid',
    },
  ],
};

function mockFetchResponses(responses: Record<string, unknown>) {
  mockFetch.mockImplementation((url: string) => {
    for (const [pattern, data] of Object.entries(responses)) {
      if (url.includes(pattern)) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
      }
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

describe('heroincome-data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDohodCache();
  });

  describe('isDohodAvailable', () => {
    it('returns true for ticker in index', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      expect(await isDohodAvailable('LKOH')).toBe(true);
    });

    it('returns false for ticker not in index', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      expect(await isDohodAvailable('UNKNOWN')).toBe(false);
    });

    it('returns false when index fetch fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      expect(await isDohodAvailable('LKOH')).toBe(false);
    });

    it('caches index — second call does not fetch again', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      await isDohodAvailable('LKOH');
      await isDohodAvailable('SBER');
      const indexCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('stocks/dohod/index.json'));
      expect(indexCalls).toHaveLength(1);
    });

    it('normalizes ticker to uppercase', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      expect(await isDohodAvailable('lkoh')).toBe(true);
    });
  });

  describe('smart-lab', () => {
    const SL_INDEX = { updatedAt: '2026-11-12T08:15:59Z', tickersCount: 2, tickers: ['LPSB', 'PHOR'] };
    const SL_PHOR = {
      ticker: 'PHOR',
      page: 'https://smart-lab.ru/q/PHOR/dividend/',
      scrapedAt: '2026-11-12T08:15:59Z',
      payments: [
        { recordDate: '2026-12-13', lastBuyDate: '2026-12-10', period: '2026 н/расп', amount: 309, currency: 'RUB', status: 'recommended' },
        { recordDate: '2025-07-05', lastBuyDate: '2025-07-03', period: '1кв 2025', amount: 201, currency: 'RUB', status: 'canceled' },
        { recordDate: '2024-07-11', lastBuyDate: '2024-07-10', period: '4кв 2023', amount: 294, currency: 'RUB', status: 'paid' },
        { recordDate: '2024-07-11', lastBuyDate: '2024-07-10', period: '1кв 2024', amount: 15, currency: 'RUB', status: 'paid' },
        { recordDate: '2019-07-01', lastBuyDate: null, period: null, amount: 1.5, currency: 'USD', status: 'paid' },
        { recordDate: '2018-07-01', lastBuyDate: null, period: null, amount: null, currency: null, status: 'paid', listedAs: 'PHOS' },
      ],
    };

    it('reads rows with their status; two dividends of one date stay two; only rubles', async () => {
      mockFetchResponses({ 'stocks/smartlab/index.json': SL_INDEX, 'stocks/smartlab/PHOR.json': SL_PHOR });
      expect(await fetchSmartlabDividends('phor')).toEqual([
        { date: new Date('2026-12-13'), amount: 309, status: 'recommended' },
        { date: new Date('2025-07-05'), amount: 201, status: 'canceled' },
        { date: new Date('2024-07-11'), amount: 294, status: 'paid' },
        { date: new Date('2024-07-11'), amount: 15, status: 'paid' },
      ]);
    });

    it('null for a ticker smart-lab does not list, without fetching its file', async () => {
      mockFetchResponses({ 'stocks/smartlab/index.json': SL_INDEX });
      expect(await isSmartlabAvailable('SBER')).toBe(false);
      expect(await fetchSmartlabDividends('SBER')).toBeNull();
      expect(mockFetch.mock.calls.some((c: unknown[]) => (c[0] as string).includes('smartlab/SBER.json'))).toBe(false);
    });

    it('tells an unreachable index from a ticker that is not listed', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      expect(await isSmartlabIndexLoaded()).toBe(false);
      resetDohodCache();
      mockFetchResponses({ 'stocks/smartlab/index.json': SL_INDEX });
      expect(await isSmartlabIndexLoaded()).toBe(true);
    });
  });

  describe('fetchDohodDividends', () => {
    it('parses fact and forecast rows correctly', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX, 'stocks/dohod/LKOH.json': MOCK_LKOH });
      const rows = await fetchDohodDividends('LKOH');
      expect(rows).not.toBeNull();
      expect(rows).toHaveLength(2); // amount: null filtered
      expect(rows![0].amount).toBe(397.0);
      expect(rows![0].date).toEqual(new Date('2026-01-12'));
      expect(rows![0].isForecast).toBe(false);
      expect(rows![1].amount).toBe(278.0);
      expect(rows![1].isForecast).toBe(true);
    });

    it('keeps zero-amount forecasts ("no dividend expected") but drops zero facts', async () => {
      mockFetchResponses({
        'dohod/index.json': MOCK_INDEX,
        'dohod/SBER.json': {
          ticker: 'SBER', scrapedAt: '', source: 'dohod.ru',
          payments: [
            { recordDate: '2027-07-20', declaredDate: null, amount: 0, year: null, isForecast: true },
            { recordDate: '2022-07-20', declaredDate: null, amount: 0, year: 2022, isForecast: false },
            { recordDate: '2026-07-20', declaredDate: null, amount: 37.64, year: 2026, isForecast: false },
          ],
        },
      });
      const rows = await fetchDohodDividends('SBER');
      expect(rows).toEqual([
        { date: new Date('2027-07-20'), amount: 0, isForecast: true },
        { date: new Date('2026-07-20'), amount: 37.64, isForecast: false },
      ]);
    });

    it('returns null for ticker not in index', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      expect(await fetchDohodDividends('UNKNOWN')).toBeNull();
    });

    it('returns null when ticker fetch fails', async () => {
      mockFetchResponses({ 'stocks/dohod/index.json': MOCK_INDEX });
      expect(await fetchDohodDividends('LKOH')).toBeNull();
    });
  });

  describe('resetDohodCache', () => {
    it('clears both stock and fund caches', async () => {
      mockFetchResponses({
        'stocks/dohod/index.json': MOCK_INDEX,
        'funds/index.json': MOCK_FUND_INDEX,
      });
      await isDohodAvailable('LKOH');
      await findFundKey('PLZ5');
      resetDohodCache();
      await isDohodAvailable('SBER');
      await findFundKey('PLZ5');
      const stockIndexCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('stocks/dohod/index.json'));
      const fundIndexCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('funds/index.json'));
      expect(stockIndexCalls).toHaveLength(2);
      expect(fundIndexCalls).toHaveLength(2);
    });
  });

  describe('findFundKey', () => {
    it('returns ticker when found in fund index', async () => {
      mockFetchResponses({ 'funds/index.json': MOCK_FUND_INDEX });
      expect(await findFundKey('PLZ5')).toBe('PLZ5');
    });

    it('returns ISIN when found in fund index', async () => {
      mockFetchResponses({ 'funds/index.json': MOCK_FUND_INDEX });
      expect(await findFundKey(undefined, 'RU000A1068X9')).toBe('RU000A1068X9');
    });

    it('prefers ticker match over ISIN', async () => {
      mockFetchResponses({ 'funds/index.json': MOCK_FUND_INDEX });
      expect(await findFundKey('PLZ5', 'RU000A1068X9')).toBe('PLZ5');
    });

    it('returns null when neither ticker nor ISIN found', async () => {
      mockFetchResponses({ 'funds/index.json': MOCK_FUND_INDEX });
      expect(await findFundKey('UNKNOWN', 'RU999999')).toBeNull();
    });

    it('returns null when fund index fetch fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      expect(await findFundKey('PLZ5')).toBeNull();
    });

    it('normalizes to uppercase', async () => {
      mockFetchResponses({ 'funds/index.json': MOCK_FUND_INDEX });
      expect(await findFundKey('plz5')).toBe('PLZ5');
    });

    // Files are keyed by ISIN; a MOEX code that differs from it comes as an alias.
    const ISIN_INDEX = {
      updatedAt: '2026-11-11T17:00:00Z',
      fundsCount: 2,
      funds: ['RU000A108BZ2', 'RU000A10BBS6'],
      aliases: { XTRIUMF: 'RU000A108BZ2' },
    };

    it('resolves a ticker through the aliases', async () => {
      mockFetchResponses({ 'funds/index.json': ISIN_INDEX });
      expect(await findFundKey('xtriumf')).toBe('RU000A108BZ2');
    });

    it('matches the MOEX code when ticker and ISIN miss', async () => {
      mockFetchResponses({ 'funds/index.json': ISIN_INDEX });
      expect(await findFundKey('МОЙ-ПАРУС', undefined, 'RU000A10BBS6')).toBe('RU000A10BBS6');
    });

    it('ignores an alias pointing to a fund not in the index', async () => {
      mockFetchResponses({ 'funds/index.json': { ...ISIN_INDEX, aliases: { OLD: 'RU000A000000' } } });
      expect(await findFundKey('OLD')).toBeNull();
    });

    it('caches fund index separately from stock index', async () => {
      mockFetchResponses({
        'stocks/dohod/index.json': MOCK_INDEX,
        'funds/index.json': MOCK_FUND_INDEX,
      });
      await isDohodAvailable('LKOH');
      await findFundKey('PLZ5');
      const indexCalls = mockFetch.mock.calls.filter((c: unknown[]) => (c[0] as string).includes('index.json'));
      expect(indexCalls).toHaveLength(2); // one stock, one fund
    });
  });

  describe('fetchFundDistributions', () => {
    it('parses distributions with amountBeforeTax and recordDate', async () => {
      mockFetchResponses({ 'funds/distributions/PLZ5.json': MOCK_PLZ5_DISTRIBUTIONS });
      const rows = await fetchFundDistributions('PLZ5');
      expect(rows).not.toBeNull();
      expect(rows).toHaveLength(2);
      expect(rows![0].amount).toBe(72.45);
      expect(rows![0].date).toEqual(new Date('2026-02-27'));
      expect(rows![1].amount).toBe(68.9);
      expect(rows![1].date).toEqual(new Date('2026-01-30'));
    });

    it('has no isForecast field on rows', async () => {
      mockFetchResponses({ 'funds/distributions/PLZ5.json': MOCK_PLZ5_DISTRIBUTIONS });
      const rows = await fetchFundDistributions('PLZ5');
      expect(rows![0]).not.toHaveProperty('isForecast');
    });

    it('filters out zero/null amountBeforeTax', async () => {
      mockFetchResponses({
        'funds/distributions/TEST.json': {
          ...MOCK_PLZ5_DISTRIBUTIONS,
          distributions: [
            ...MOCK_PLZ5_DISTRIBUTIONS.distributions,
            { paymentDate: '2025-12-13', recordDate: '2025-11-28', unitPrice: 8100, amountBeforeTax: 0, amountAfterTax: 0, yieldPrc: 0, status: 'paid' },
          ],
        },
      });
      const rows = await fetchFundDistributions('TEST');
      expect(rows).toHaveLength(2);
    });

    it('falls back to paymentDate when recordDate is missing, skips rows without any date', async () => {
      mockFetchResponses({
        'funds/distributions/TEST.json': {
          ...MOCK_PLZ5_DISTRIBUTIONS,
          distributions: [
            { paymentDate: '2023-03-14', recordDate: null, unitPrice: 1000, amountBeforeTax: 10, amountAfterTax: 8.7, yieldPrc: 12, status: 'paid' },
            { paymentDate: null, recordDate: null, unitPrice: 1000, amountBeforeTax: 10, amountAfterTax: 8.7, yieldPrc: 12, status: 'paid' },
          ],
        },
      });
      const rows = await fetchFundDistributions('TEST');
      expect(rows).toEqual([{ date: new Date('2023-03-14'), amount: 10 }]);
    });

    it('returns null when distribution file not found', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      expect(await fetchFundDistributions('UNKNOWN')).toBeNull();
    });
  });
});
