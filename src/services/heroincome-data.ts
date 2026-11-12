import type { DividendHistoryRow } from './moex-api';

const BASE_URL = 'https://raw.githubusercontent.com/amchercashin/heroincome-data/main/data';
const FETCH_TIMEOUT = 5000;

interface DohodPayment {
  recordDate: string;
  declaredDate: string | null;
  amount: number | null;
  year: number | null;
  isForecast: boolean;
}

interface DohodTickerData {
  ticker: string;
  scrapedAt: string;
  source: string;
  payments: DohodPayment[];
}

interface DohodIndex {
  updatedAt: string;
  tickersCount?: number;
  tickers: string[];
}

export interface DohodDividendRow {
  date: Date;
  amount: number;
  isForecast: boolean;
}

// ---- smart-lab types ----

/**
 * paid — the register has closed; canceled; upcoming: recommended (by the board of directors),
 * forecast, or expected (listed as upcoming, but smart-lab's calendar does not say which).
 */
export type SmartlabStatus = 'paid' | 'canceled' | 'recommended' | 'forecast' | 'expected';

interface SmartlabPayment {
  recordDate: string;
  lastBuyDate: string | null;
  period: string | null;
  amount: number | null;
  currency: string | null;
  status: SmartlabStatus;
  /** The ticker smart-lab lists the row under, when it is a renamed company's old one. */
  listedAs?: string;
}

interface SmartlabTickerData {
  ticker: string;
  page: string;
  scrapedAt: string;
  payments: SmartlabPayment[];
}

export interface SmartlabDividendRow {
  date: Date;
  amount: number;
  status: SmartlabStatus;
}

// ---- Fund distribution types ----

interface FundDistributionRaw {
  paymentDate: string | null;
  /** Occasionally missing in the source sheet — fall back to paymentDate. */
  recordDate: string | null;
  unitPrice: number;
  amountBeforeTax: number;
  amountAfterTax: number;
  yieldPrc: number;
  status: string;
}

interface FundDistributionData {
  isin: string;
  ticker: string | null;
  name: string;
  managementCompany: string;
  scrapedAt: string;
  distributions: FundDistributionRaw[];
}

interface FundIndex {
  updatedAt: string;
  fundsCount: number;
  /** File keys — the fund's ISIN. */
  funds: string[];
  /** MOEX code → key, for funds whose exchange code differs from the ISIN (XTRIUMF). */
  aliases?: Record<string, string>;
}

// ---- Shared fetch ----

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/** Parsed JSON, or null when the file is missing or the host is unreachable. */
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---- Index caches ----
// The promise is cached, not the value: securities are synced in parallel, and they all share
// one request for the index. A failed load stays cached too (null) until the next full sync, so
// an unreachable GitHub costs one timeout, not one per security.

let stockIndex: Promise<DohodIndex | null> | undefined;
let smartlabIndex: Promise<DohodIndex | null> | undefined;
let fundIndex: Promise<FundIndex | null> | undefined;

/** Forgets every index of heroincome-data (dohod.ru, smart-lab, funds) before a full sync. */
export function resetDohodCache(): void {
  stockIndex = undefined;
  smartlabIndex = undefined;
  fundIndex = undefined;
}

function fetchDohodIndex(): Promise<DohodIndex | null> {
  return (stockIndex ??= fetchJson<DohodIndex>(`${BASE_URL}/stocks/dohod/index.json`));
}

function fetchSmartlabIndex(): Promise<DohodIndex | null> {
  return (smartlabIndex ??= fetchJson<DohodIndex>(`${BASE_URL}/stocks/smartlab/index.json`));
}

function fetchFundIndex(): Promise<FundIndex | null> {
  return (fundIndex ??= fetchJson<FundIndex>(`${BASE_URL}/funds/index.json`));
}

/**
 * False when the index could not be loaded (offline, GitHub unreachable). Coverage is then
 * unknown — not "this security is not covered".
 */
export async function isDohodIndexLoaded(): Promise<boolean> {
  return (await fetchDohodIndex()) != null;
}

export async function isSmartlabIndexLoaded(): Promise<boolean> {
  return (await fetchSmartlabIndex()) != null;
}

export async function isFundIndexLoaded(): Promise<boolean> {
  return (await fetchFundIndex()) != null;
}

// ---- Stock dohod ----

export async function isDohodAvailable(ticker: string): Promise<boolean> {
  const index = await fetchDohodIndex();
  if (!index) return false;
  return index.tickers.includes(ticker.toUpperCase());
}

export async function fetchDohodDividends(ticker: string): Promise<DohodDividendRow[] | null> {
  const available = await isDohodAvailable(ticker);
  if (!available) return null;
  const data = await fetchJson<DohodTickerData>(`${BASE_URL}/stocks/dohod/${ticker.toUpperCase()}.json`);
  if (!Array.isArray(data?.payments)) return null;
  // A zero-amount forecast is dohod.ru saying "no dividend expected" — keep it
  // (the projection uses it to stop repeating last year's payment); drop other empties.
  return data.payments
    .filter((p) => p.amount != null && p.recordDate && (p.amount > 0 || p.isForecast))
    .map((p) => ({ date: new Date(p.recordDate), amount: p.amount!, isForecast: p.isForecast }));
}

// ---- Stock smart-lab ----

export async function isSmartlabAvailable(ticker: string): Promise<boolean> {
  const index = await fetchSmartlabIndex();
  if (!index) return false;
  return index.tickers.includes(ticker.toUpperCase());
}

/**
 * smart-lab rows of a stock, or null when it is not listed or the file failed to load.
 * Only ruble amounts: a dividend in another currency would be summed with rubles.
 */
export async function fetchSmartlabDividends(ticker: string): Promise<SmartlabDividendRow[] | null> {
  if (!(await isSmartlabAvailable(ticker))) return null;
  const data = await fetchJson<SmartlabTickerData>(`${BASE_URL}/stocks/smartlab/${ticker.toUpperCase()}.json`);
  if (!Array.isArray(data?.payments)) return null;
  return data.payments
    .filter((p) => p.amount != null && p.amount > 0 && p.recordDate && (p.currency == null || p.currency === 'RUB'))
    .map((p) => ({ date: new Date(p.recordDate), amount: p.amount!, status: p.status }));
}

// ---- Fund distributions ----

/** The fund's file key, by any of its codes (ticker, ISIN, MOEX secid), directly or through an alias. */
export async function findFundKey(...codes: (string | undefined)[]): Promise<string | null> {
  const index = await fetchFundIndex();
  if (!index) return null;
  for (const code of codes) {
    if (!code) continue;
    const upper = code.toUpperCase();
    if (index.funds.includes(upper)) return upper;
    const alias = index.aliases?.[upper];
    if (alias && index.funds.includes(alias)) return alias;
  }
  return null;
}

export async function fetchFundDistributions(key: string): Promise<DividendHistoryRow[] | null> {
  const data = await fetchJson<FundDistributionData>(`${BASE_URL}/funds/distributions/${key}.json`);
  if (!Array.isArray(data?.distributions)) return null;
  return data.distributions
    .filter((d) => d.amountBeforeTax != null && d.amountBeforeTax > 0 && (d.recordDate || d.paymentDate))
    .map((d) => ({
      date: new Date((d.recordDate ?? d.paymentDate)!),
      amount: d.amountBeforeTax,
    }));
}
