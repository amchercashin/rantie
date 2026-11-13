const MOEX_BASE_URL = 'https://iss.moex.com/iss';

// ============ Types ============

export interface ISSBlock {
  columns: string[];
  data: (string | number | null)[][];
}

export interface ISSResponse {
  [blockName: string]: ISSBlock;
}

export interface SecurityInfo {
  secid: string;
  primaryBoardId: string;
  market: 'shares' | 'bonds';
  /** Human-readable short name, e.g. "Сбербанк" — when MOEX returns it. */
  shortName?: string;
}

export interface MoexSecurityFull {
  secid: string;
  primaryBoardId: string;
  market: 'shares' | 'bonds';
  shortName?: string;
  fullName?: string;
  isin?: string;
  secType?: string;
  emitter?: string;
}

export interface StockPriceResult {
  currentPrice: number | null;
  prevPrice: number | null;
}

export interface BondDataResult {
  /** Price as percentage of face value (e.g. 61.5 means 61.5% of nominal) */
  currentPrice: number | null;
  prevPrice: number | null;
  faceValue: number;
  accruedInterest: number;
  couponValue: number;
  nextCouponDate: string | null;
  couponPeriod: number;
}

export interface DividendInfo {
  lastPaymentAmount: number;
  lastPaymentDate: Date;
  frequencyPerYear: number;
  nextExpectedCutoffDate: Date | null;
}

export interface DividendHistoryRow {
  date: Date;
  amount: number;
  /** A coupon ahead whose amount is MOEX's schedule, not yet fixed (see couponRows). */
  isForecast?: boolean;
}

export interface DividendResult {
  summary: DividendInfo;
  history: DividendHistoryRow[];
}

// ============ Board → Market mapping ============

const BOARD_TO_MARKET: Record<string, 'shares' | 'bonds'> = {
  TQBR: 'shares',
  TQTF: 'shares',
  TQPI: 'shares',
  TQIR: 'shares',
  TQIF: 'shares',
  TQOB: 'bonds',
  TQCB: 'bonds',
  EQOB: 'bonds',
};

function resolveMarket(
  boardId: string,
  group: string,
): 'shares' | 'bonds' | null {
  if (BOARD_TO_MARKET[boardId]) return BOARD_TO_MARKET[boardId];
  if (group.includes('bond')) return 'bonds';
  if (group.includes('share') || group.includes('ppif')) return 'shares';
  return null;
}

// ============ Pure Functions ============

export function parseISSBlock(
  block: ISSBlock,
): Record<string, string | number | null>[] {
  return block.data.map((row) => {
    const obj: Record<string, string | number | null> = {};
    block.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/** Payments this close are one payout: two dividends with one record date, split coupons. */
const SAME_PAYOUT_DAYS = 3;

export function calcDividendFrequency(dates: Date[]): number {
  const DAY_MS = 1000 * 60 * 60 * 24;
  const payouts: number[] = [];
  for (const t of dates.map((d) => d.getTime()).sort((a, b) => a - b)) {
    const last = payouts[payouts.length - 1];
    if (last == null || (t - last) / DAY_MS > SAME_PAYOUT_DAYS) payouts.push(t);
  }
  if (payouts.length < 2) return 1;

  const intervals: number[] = [];
  for (let i = 1; i < payouts.length; i++) {
    intervals.push((payouts[i] - payouts[i - 1]) / DAY_MS);
  }

  const avgDays = intervals.reduce((s, d) => s + d, 0) / intervals.length;

  if (avgDays < 45) return 12;
  if (avgDays < 120) return 4;
  if (avgDays < 270) return 2;
  return 1;
}

export function parseDividendHistory(
  rows: Record<string, string | number | null>[],
  today: Date = new Date(),
): DividendInfo | null {
  const todayMs = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();

  const valid = rows.filter(
    (r) => r.registryclosedate != null && r.value != null,
  );
  if (valid.length === 0) return null;

  const sorted = [...valid].sort(
    (a, b) =>
      new Date(a.registryclosedate as string).getTime() -
      new Date(b.registryclosedate as string).getTime(),
  );

  const past = sorted.filter(
    (r) => new Date(r.registryclosedate as string).getTime() <= todayMs,
  );
  const future = sorted.filter(
    (r) => new Date(r.registryclosedate as string).getTime() > todayMs,
  );

  if (past.length === 0) return null;

  const last = past[past.length - 1];
  const frequency = calcDividendFrequency(
    past.map((r) => new Date(r.registryclosedate as string)),
  );

  return {
    lastPaymentAmount: last.value as number,
    lastPaymentDate: new Date(last.registryclosedate as string),
    frequencyPerYear: frequency,
    nextExpectedCutoffDate:
      future.length > 0
        ? new Date(future[0].registryclosedate as string)
        : null,
  };
}

// ============ ISS Fetch Helper ============

const FETCH_TIMEOUT_MS = 10_000;

async function fetchISS(
  path: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<ISSResponse | null> {
  const url = new URL(`${MOEX_BASE_URL}${path}`);
  url.searchParams.set('iss.meta', 'off');
  if (params) {
    for (const [key, val] of Object.entries(params)) {
      url.searchParams.set(key, val);
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let ac: AbortController | undefined;

  if (!signal) {
    ac = new AbortController();
    timeoutId = setTimeout(() => ac!.abort(), FETCH_TIMEOUT_MS);
    signal = ac.signal;
  }

  try {
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// ============ Exchange Rates ============

/**
 * MOEX indicative rates (used for derivatives clearing): USD, EUR, CNY, GBP and
 * other currencies against the ruble, twice a day. Picks the latest rate of each
 * X/RUB pair; cross rates and empty values are skipped.
 */
export function parseIndicativeRates(json: unknown): Map<string, number> {
  const block = (json as { securities?: ISSBlock } | null | undefined)?.securities;
  if (!block?.columns || !Array.isArray(block.data)) return new Map();

  const latest = new Map<string, { at: string; rate: number }>();
  for (const row of parseISSBlock(block)) {
    const pair = /^([A-Z]{3})\/RUB$/.exec(String(row.secid ?? ''));
    if (!pair || row.rate == null) continue;
    const rate = Number(row.rate);
    if (!isFinite(rate) || rate <= 0) continue;
    const at = `${row.tradedate ?? ''} ${row.tradetime ?? ''}`;
    const prev = latest.get(pair[1]);
    if (!prev || at > prev.at) latest.set(pair[1], { at, rate });
  }
  return new Map([...latest].map(([currency, { rate }]) => [currency, rate]));
}

/** Currency → rubles per unit, or null when MOEX is unreachable or returned nothing. */
export async function fetchIndicativeRates(): Promise<Map<string, number> | null> {
  const data = await fetchISS('/statistics/engines/futures/markets/indicativerates/securities.json', {
    'iss.only': 'securities',
  });
  const rates = parseIndicativeRates(data);
  return rates.size > 0 ? rates : null;
}

// ============ Paginated ISS Fetch ============

// MOEX ISS default page size; used as threshold for pagination detection
const ISS_DEFAULT_PAGE_SIZE = 20;
const MAX_ISS_PAGES = 50;

async function fetchAllISSPages(
  path: string,
  blockName: string,
  params?: Record<string, string>,
  signal?: AbortSignal,
): Promise<Record<string, string | number | null>[]> {
  const allRows: Record<string, string | number | null>[] = [];
  let start = 0;
  let pageSize = ISS_DEFAULT_PAGE_SIZE;

  for (let page = 0; page < MAX_ISS_PAGES; page++) {
    const data = await fetchISS(path, {
      ...params,
      'iss.only': blockName,
      [`${blockName}.start`]: String(start),
    }, signal);
    if (!data?.[blockName]) break;
    const rows = parseISSBlock(data[blockName]);
    if (rows.length === 0) break;
    allRows.push(...rows);
    // Use first page to detect actual page size (may differ from default)
    if (page === 0 && rows.length > pageSize) pageSize = rows.length;
    if (rows.length < pageSize) break;
    start += rows.length;
  }

  return allRows;
}

// ============ Fetch Functions ============

export async function resolveSecurityInfo(
  query: string,
): Promise<SecurityInfo | null> {
  const data = await fetchISS('/securities.json', {
    q: query,
    'securities.columns': 'secid,shortname,primary_boardid,group,is_traded',
  });
  if (!data?.securities) return null;

  const rows = parseISSBlock(data.securities);

  // Exact secid match first (for ticker queries)
  const exactMatch = rows.find(
    (r) => r.secid === query && r.is_traded === 1,
  );
  // Fallback: first traded result (for ISIN queries where secid differs)
  const match = exactMatch ?? rows.find((r) => r.is_traded === 1);
  if (!match) return null;

  const secid = match.secid as string;
  const boardId = match.primary_boardid as string;
  const group = match.group as string;
  const market = resolveMarket(boardId, group);
  if (!market) return null;

  const shortName = typeof match.shortname === 'string' && match.shortname.trim() ? match.shortname.trim() : undefined;
  return { secid, primaryBoardId: boardId, market, ...(shortName ? { shortName } : {}) };
}

export async function resolveSecurityFull(
  query: string,
): Promise<MoexSecurityFull | null> {
  const data = await fetchISS('/securities.json', {
    q: query,
    'securities.columns': 'secid,shortname,name,isin,primary_boardid,group,type,emitent_title,is_traded',
  });
  if (!data?.securities) return null;

  const rows = parseISSBlock(data.securities);

  const exactMatch = rows.find(
    (r) => r.secid === query && r.is_traded === 1,
  );
  const match = exactMatch ?? rows.find((r) => r.is_traded === 1);
  if (!match) return null;

  const secid = match.secid as string;
  const boardId = match.primary_boardid as string;
  const group = match.group as string;
  const market = resolveMarket(boardId, group);
  if (!market) return null;

  return {
    secid,
    primaryBoardId: boardId,
    market,
    shortName: (match.shortname as string) || undefined,
    fullName: (match.name as string) || undefined,
    isin: (match.isin as string) || undefined,
    secType: (match.type as string) || undefined,
    emitter: (match.emitent_title as string) || undefined,
  };
}

export async function fetchStockPrice(
  ticker: string,
  boardId: string,
): Promise<StockPriceResult | null> {
  const data = await fetchISS(
    `/engines/stock/markets/shares/boards/${boardId}/securities/${ticker}.json`,
    {
      'marketdata.columns': 'SECID,LAST,LCURRENTPRICE',
      'securities.columns': 'SECID,PREVPRICE',
    },
  );
  if (!data?.marketdata || !data?.securities) return null;

  const md = parseISSBlock(data.marketdata)[0];
  const sec = parseISSBlock(data.securities)[0];
  if (!md && !sec) return null;

  return {
    currentPrice: (md?.LAST ?? md?.LCURRENTPRICE ?? null) as number | null,
    prevPrice: (sec?.PREVPRICE ?? null) as number | null,
  };
}

export async function fetchBondData(
  ticker: string,
  boardId: string,
): Promise<BondDataResult | null> {
  const data = await fetchISS(
    `/engines/stock/markets/bonds/boards/${boardId}/securities/${ticker}.json`,
    {
      'marketdata.columns': 'SECID,LAST,LCURRENTPRICE',
      'securities.columns':
        'SECID,PREVPRICE,FACEVALUE,ACCRUEDINT,COUPONVALUE,NEXTCOUPON,COUPONPERIOD',
    },
  );
  if (!data?.securities) return null;

  const md = data.marketdata ? parseISSBlock(data.marketdata)[0] : null;
  const sec = parseISSBlock(data.securities)[0];
  if (!sec) return null;

  return {
    currentPrice: (md?.LAST ?? md?.LCURRENTPRICE ?? null) as number | null,
    prevPrice: (sec?.PREVPRICE ?? null) as number | null,
    faceValue: sec.FACEVALUE as number,
    accruedInterest: (sec.ACCRUEDINT as number) ?? 0,
    couponValue: sec.COUPONVALUE as number,
    nextCouponDate: (sec.NEXTCOUPON as string | null) ?? null,
    couponPeriod: sec.COUPONPERIOD as number,
  };
}

/**
 * Dividend history from MOEX ISS — kept only as the last fallback.
 * Since autumn 2026 (seen 2026-09 … 2026-11) `/securities/{secid}/dividends.json` answers like an
 * unknown path (`description` + `boards`, no `dividends` block), and dividends moved to
 * `/iss/cci/corp-actions/dividends`, which is for paid subscribers only. So this returns null
 * for everything; it is left in place to pick the data up again if the free route comes back.
 */
export async function fetchDividends(
  secid: string,
): Promise<DividendResult | null> {
  try {
    // Dividends endpoint returns all data at once (no pagination needed)
    const data = await fetchISS(`/securities/${secid}/dividends.json`, {
      'iss.only': 'dividends',
    });
    if (!data?.dividends) return null;
    const allRows = parseISSBlock(data.dividends);
    if (allRows.length === 0) return null;
    const summary = parseDividendHistory(allRows);
    if (!summary) return null;

    const history: DividendHistoryRow[] = allRows
      .filter((r) => r.registryclosedate && r.value != null)
      .map((r) => ({
        date: new Date(r.registryclosedate as string),
        amount: r.value as number,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    return { summary, history };
  } catch {
    return null;
  }
}

/** How far ahead MOEX's coupon schedule is kept: the calendar looks a year ahead, the rest is slack for a sync done a while ago. */
export const COUPON_SCHEDULE_MONTHS = 18;

/**
 * A bond's coupons from MOEX's schedule (`bondization`):
 * - paid coupons — dated today or earlier;
 * - the nearest coupon ahead, when MOEX states its amount. That is the current period's coupon, and
 *   it is fixed: the accrued interest (НКД) is counted from it. So it is stored as a real payment dated
 *   in the future — the calendar shows it as «ожидается», and it counts as income from its date;
 * - later coupons, up to COUPON_SCHEDULE_MONTHS ahead, as forecasts: a floater's later amounts are only
 *   MOEX's placeholder (the current coupon repeated), and a fixed coupon is exact but still ahead.
 * A coupon without an amount is not known yet (a RUONIA floater before its fixing) and is skipped.
 */
export function couponRows(rows: Record<string, unknown>[], now: Date): DividendHistoryRow[] {
  const until = new Date(now);
  until.setMonth(until.getMonth() + COUPON_SCHEDULE_MONTHS);
  const dated = rows
    .filter((r) => r.coupondate)
    .map((r) => ({ date: new Date(r.coupondate as string), amount: r.value_rub as number | null | undefined }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nearest = dated.find((r) => r.date > now);
  const out: DividendHistoryRow[] = [];
  for (const r of dated) {
    if (r.amount == null || r.date > until) continue;
    if (r.date <= now || r === nearest) out.push({ date: r.date, amount: r.amount });
    else out.push({ date: r.date, amount: r.amount, isForecast: true });
  }
  return out;
}

export async function fetchCouponHistory(
  secid: string,
): Promise<DividendHistoryRow[]> {
  try {
    const allRows = await fetchAllISSPages(
      `/securities/${secid}/bondization.json`,
      'coupons',
    );
    return couponRows(allRows, new Date());
  } catch {
    return [];
  }
}

// ============ Batch Functions ============

export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

export async function fetchBatchStockPrices(
  secids: string[],
  boardId: string,
): Promise<Map<string, StockPriceResult>> {
  const result = new Map<string, StockPriceResult>();
  if (secids.length === 0) return result;

  try {
    const data = await fetchISS(
      `/engines/stock/markets/shares/boards/${boardId}/securities.json`,
      {
        securities: secids.join(','),
        'marketdata.columns': 'SECID,LAST,LCURRENTPRICE',
        'securities.columns': 'SECID,PREVPRICE',
      },
    );
    if (!data?.marketdata || !data?.securities) return result;

    const mdRows = parseISSBlock(data.marketdata);
    const secRows = parseISSBlock(data.securities);

    const mdMap = new Map(mdRows.map((r) => [r.SECID as string, r]));
    const secMap = new Map(secRows.map((r) => [r.SECID as string, r]));

    for (const secid of secids) {
      const md = mdMap.get(secid);
      const sec = secMap.get(secid);
      if (!md && !sec) continue;
      result.set(secid, {
        currentPrice: (md?.LAST ?? md?.LCURRENTPRICE ?? null) as number | null,
        prevPrice: (sec?.PREVPRICE ?? null) as number | null,
      });
    }
  } catch {
    // partial failure — return whatever we have
  }
  return result;
}

export async function fetchBatchBondData(
  secids: string[],
  boardId: string,
): Promise<Map<string, BondDataResult>> {
  const result = new Map<string, BondDataResult>();
  if (secids.length === 0) return result;

  try {
    const data = await fetchISS(
      `/engines/stock/markets/bonds/boards/${boardId}/securities.json`,
      {
        securities: secids.join(','),
        'marketdata.columns': 'SECID,LAST,LCURRENTPRICE',
        'securities.columns':
          'SECID,PREVPRICE,FACEVALUE,ACCRUEDINT,COUPONVALUE,NEXTCOUPON,COUPONPERIOD',
      },
    );
    if (!data?.securities) return result;

    const mdRows = data.marketdata ? parseISSBlock(data.marketdata) : [];
    const secRows = parseISSBlock(data.securities);

    const mdMap = new Map(mdRows.map((r) => [r.SECID as string, r]));

    for (const sec of secRows) {
      const secid = sec.SECID as string;
      if (!secids.includes(secid)) continue;
      const md = mdMap.get(secid);
      result.set(secid, {
        currentPrice: (md?.LAST ?? md?.LCURRENTPRICE ?? null) as number | null,
        prevPrice: (sec.PREVPRICE ?? null) as number | null,
        faceValue: sec.FACEVALUE as number,
        accruedInterest: (sec.ACCRUEDINT as number) ?? 0,
        couponValue: sec.COUPONVALUE as number,
        nextCouponDate: (sec.NEXTCOUPON as string | null) ?? null,
        couponPeriod: sec.COUPONPERIOD as number,
      });
    }
  } catch {
    // partial failure — return whatever we have
  }
  return result;
}
