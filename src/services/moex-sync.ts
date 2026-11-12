import Dexie from 'dexie';
import { isExchangeTraded } from '@/models/asset-kind';
import { db } from '@/db/database';
import type { Asset, PaymentHistory, DataSource } from '@/models/types';
import type { DividendHistoryRow, DividendResult, StockPriceResult, BondDataResult } from './moex-api';
import {
  resolveSecurityInfo,
  fetchBondData,
  fetchDividends,
  fetchCouponHistory,
  fetchBatchStockPrices,
  fetchBatchBondData,
  calcDividendFrequency,
  chunk,
} from './moex-api';
import {
  fetchDohodDividends,
  isDohodAvailable,
  isDohodIndexLoaded,
  isFundIndexLoaded,
  resetDohodCache,
  findFundKey,
  fetchFundDistributions,
} from '@/services/heroincome-data';
import { refreshExchangeRates } from '@/services/exchange-rates';
import { markSynced } from '@/services/sync-state';

// ============ Concurrency Helper ============

export async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        const value = await tasks[index]();
        results[index] = { status: 'fulfilled', value };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  errors: string[];
  warnings: string[];
  /** Currencies whose MOEX rate was refreshed. */
  ratesUpdated: string[];
}

interface ResolvedAsset {
  asset: Asset;
  secid: string;
  boardId: string;
  market: 'shares' | 'bonds';
}

export function isSyncable(asset: Asset): boolean {
  return isExchangeTraded(asset);
}

export async function syncAllAssets(options?: { pricesOnly?: boolean }): Promise<SyncResult> {
  const assets = await db.assets.toArray();
  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, errors: [], warnings: [], ratesUpdated: [] };
  resetDohodCache();

  // Rates first and regardless of exchange-traded assets: a portfolio of USD crypto
  // has nothing to sync on MOEX but still needs the rate to count in rubles.
  const rates = await refreshExchangeRates();
  result.ratesUpdated = rates.updated;
  if (rates.missing.length > 0) {
    result.warnings.push(`Нет курса ${rates.missing.join(', ')} — укажите его в Настройках`);
  }

  // Filter syncable assets
  const syncable = assets.filter(isSyncable);
  result.skipped = assets.length - syncable.length;

  // Phase 1: Resolve — resolve secid/boardId/market with concurrency=5
  const resolved: ResolvedAsset[] = [];
  const resolveTasks = syncable.map((asset) => () => resolveAndCache(asset));
  const resolveResults = await runWithConcurrency(resolveTasks, 5);

  for (let i = 0; i < resolveResults.length; i++) {
    const r = resolveResults[i];
    if (r.status === 'fulfilled' && r.value) {
      resolved.push(r.value);
    } else {
      result.failed++;
      const ticker = syncable[i].ticker ?? syncable[i].isin ?? 'unknown';
      const reason = r.status === 'rejected'
        ? (r.reason instanceof Error ? r.reason.message : String(r.reason))
        : 'Не найден на MOEX';
      result.errors.push(`${ticker}: ${reason}`);
    }
  }

  // Phase 2: Batch prices — group by market+board, fetch in parallel
  const groups = groupByMarketAndBoard(resolved);
  const priceMap = new Map<string, StockPriceResult | BondDataResult>();

  await Promise.all(
    groups.map(async (group) => {
      const batchResult = await fetchGroupPrices(group);
      for (const [secid, data] of batchResult) {
        priceMap.set(secid, data);
      }
    }),
  );

  // Bonds the batch did not return are asked one by one.
  const missingBonds = resolved.filter((ra) => ra.market === 'bonds' && !priceMap.has(ra.secid));
  await runWithConcurrency(
    missingBonds.map((ra) => async () => {
      const data = await fetchBondData(ra.secid, ra.boardId);
      if (data) priceMap.set(ra.secid, data);
    }),
    3,
  );

  const fail = (ra: ResolvedAsset, reason: unknown) => {
    result.failed++;
    const ticker = ra.asset.ticker ?? ra.secid;
    result.errors.push(`${ticker}: ${reason instanceof Error ? reason.message : String(reason)}`);
  };

  // Phase 3: Prices — written for all securities in one transaction. Every write to `assets`
  // makes the open screens recalculate the whole portfolio; one write means one recalculation
  // instead of one per security.
  const now = new Date();
  const priced: ResolvedAsset[] = [];
  const patches: { key: number; changes: Partial<Asset> }[] = [];
  for (const ra of resolved) {
    const data = priceMap.get(ra.secid);
    if (ra.market === 'bonds' && !data) {
      fail(ra, NO_BOND_DATA);
      continue;
    }
    const changes = pricePatch(ra, data, now);
    if (changes) patches.push({ key: ra.asset.id!, changes });
    priced.push(ra);
  }
  if (patches.length > 0) await db.assets.bulkUpdate(patches);

  // Phase 4: Payments — dividends, distributions and coupons with concurrency=3
  const pricesOnly = options?.pricesOnly ?? false;
  if (pricesOnly) {
    result.synced += priced.length;
  } else {
    const paymentResults = await runWithConcurrency(
      priced.map((ra) => () => syncPayments(ra, priceMap.get(ra.secid))),
      3,
    );
    for (let i = 0; i < paymentResults.length; i++) {
      const r = paymentResults[i];
      if (r.status === 'fulfilled') {
        result.synced++;
        result.warnings.push(...r.value);
      } else {
        fail(priced[i], r.reason);
      }
    }
  }

  if (result.synced > 0) await markSynced(pricesOnly ? 'prices' : 'full');

  return result;
}

export async function syncSingleAsset(assetId: number): Promise<{ success: boolean; error?: string }> {
  const asset = await db.assets.get(assetId);
  if (!asset || !isSyncable(asset)) return { success: false };

  try {
    const ra = await resolveAndCache(asset);
    if (!ra) return { success: false, error: 'Не найден на MOEX' };

    const prices = await fetchGroupPrices({ market: ra.market, boardId: ra.boardId, secids: [ra.secid] });
    let data = prices.get(ra.secid);
    if (ra.market === 'bonds' && !data) data = (await fetchBondData(ra.secid, ra.boardId)) ?? undefined;
    if (ra.market === 'bonds' && !data) return { success: false, error: NO_BOND_DATA };

    const changes = pricePatch(ra, data, new Date());
    if (changes) await db.assets.update(ra.asset.id!, changes);
    await syncPayments(ra, data);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ Phase 1: Resolve ============

async function resolveAndCache(asset: Asset): Promise<ResolvedAsset | null> {
  // Use cached values if all three are present
  if (asset.moexSecid && asset.moexBoardId && asset.moexMarket) {
    return {
      asset,
      secid: asset.moexSecid,
      boardId: asset.moexBoardId,
      market: asset.moexMarket,
    };
  }

  // Resolve from API
  let info = null;
  if (asset.moexSecid) {
    info = await resolveSecurityInfo(asset.moexSecid);
  } else {
    if (asset.isin) info = await resolveSecurityInfo(asset.isin);
    if (!info && asset.ticker) info = await resolveSecurityInfo(asset.ticker);
  }
  if (!info) return null;

  // Cache resolved fields + auto-fill ticker from secid if missing
  const cacheUpdates: Partial<Asset> = {
    moexSecid: info.secid,
    moexBoardId: info.primaryBoardId,
    moexMarket: info.market,
  };
  if (!asset.ticker) {
    cacheUpdates.ticker = info.secid;
  }
  // Assets added by ticker only are named after it — replace with the MOEX name.
  const placeholderName = !asset.name || asset.name.toUpperCase() === (asset.ticker ?? info.secid).toUpperCase();
  if (placeholderName && info.shortName) {
    cacheUpdates.name = info.shortName;
  }
  await db.assets.update(asset.id!, cacheUpdates);

  return {
    asset: { ...asset, ...cacheUpdates },
    secid: info.secid,
    boardId: info.primaryBoardId,
    market: info.market,
  };
}

// ============ Phase 2: Batch Prices ============

interface PriceGroup {
  market: 'shares' | 'bonds';
  boardId: string;
  secids: string[];
}

function groupByMarketAndBoard(resolved: ResolvedAsset[]): PriceGroup[] {
  const map = new Map<string, PriceGroup>();
  for (const ra of resolved) {
    const key = `${ra.market}:${ra.boardId}`;
    let group = map.get(key);
    if (!group) {
      group = { market: ra.market, boardId: ra.boardId, secids: [] };
      map.set(key, group);
    }
    group.secids.push(ra.secid);
  }
  return Array.from(map.values());
}

async function fetchGroupPrices(
  group: PriceGroup,
): Promise<Map<string, StockPriceResult | BondDataResult>> {
  const result = new Map<string, StockPriceResult | BondDataResult>();
  const chunks = chunk(group.secids, 10);

  await Promise.all(
    chunks.map(async (secidChunk) => {
      const batchResult =
        group.market === 'bonds'
          ? await fetchBatchBondData(secidChunk, group.boardId)
          : await fetchBatchStockPrices(secidChunk, group.boardId);
      for (const [secid, data] of batchResult) {
        result.set(secid, data);
      }
    }),
  );

  return result;
}

// ============ Phase 3: Prices ============

const NO_BOND_DATA = 'Нет данных на MOEX';

/** What the exchange says about the price, as a patch for the asset; null — nothing to write. */
function pricePatch(
  ra: ResolvedAsset,
  data: StockPriceResult | BondDataResult | undefined,
  now: Date,
): Partial<Asset> | null {
  const price = data?.currentPrice ?? data?.prevPrice;
  if (!data || price == null) return null;
  if (ra.market === 'bonds') {
    // MOEX quotes a bond in percent of its face value.
    const bond = data as BondDataResult;
    return {
      currentPrice: bond.faceValue * (price / 100),
      faceValue: bond.faceValue,
      accruedInterest: bond.accruedInterest,
      updatedAt: now,
    };
  }
  return { currentPrice: price, updatedAt: now };
}

// ============ Phase 4: Payments ============

/** Payments and their frequency for one security. Returns warnings for the user. */
async function syncPayments(
  ra: ResolvedAsset,
  priceData: StockPriceResult | BondDataResult | undefined,
): Promise<string[]> {
  const ticker = ra.asset.ticker ?? ra.secid;
  const warnings: string[] = [];

  if (ra.market === 'bonds') {
    const bondData = priceData as BondDataResult | undefined;
    if (!bondData) throw new Error(NO_BOND_DATA);

    await updateMoexAssetFields(ra.asset, {
      frequencyPerYear: bondData.couponPeriod > 0 ? Math.min(Math.round(365 / bondData.couponPeriod), 52) : 2,
      nextExpectedDate: bondData.nextCouponDate ? new Date(bondData.nextCouponDate) : undefined,
    });

    // Coupon history (not batchable)
    const couponHistory = await fetchCouponHistory(ra.secid);
    if (couponHistory.length > 0) {
      await writePaymentHistory(ra.asset.id!, couponHistory, 'coupon');
    } else if ((await storedPayments(ra.asset.id!)).length === 0) {
      warnings.push(`${ticker}: купоны не загружены`);
    }
    return warnings;
  }

  if (ra.asset.type === 'Фонды') {
    const { fundRows } = await syncFundDistributions(ra);
    const activeDates = await storedPaymentDates(ra.asset.id!);

    if (activeDates.length >= 2) {
      await updateMoexAssetFields(ra.asset, { frequencyPerYear: calcDividendFrequency(activeDates) });
    } else if (activeDates.length === 0 && !fundRows) {
      warnings.push(`${ticker}: распределения не загружены`);
    }
    return warnings;
  }

  const { dohodRows, divInfo } = await syncStockDividends(ra);
  const activeDates = await storedPaymentDates(ra.asset.id!);

  const frequencyPerYear = activeDates.length >= 2
    ? calcDividendFrequency(activeDates)
    : (divInfo?.summary.frequencyPerYear ?? undefined);

  // nextExpectedCutoffDate: prefer dohod forecast, then MOEX
  let nextExpectedCutoffDate: Date | undefined;
  if (dohodRows) {
    const now = new Date();
    nextExpectedCutoffDate = dohodRows
      .filter((r) => r.isForecast && r.date > now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.date;
  }
  nextExpectedCutoffDate ??= divInfo?.summary.nextExpectedCutoffDate ?? undefined;

  if (frequencyPerYear != null) {
    await updateMoexAssetFields(ra.asset, { frequencyPerYear, nextExpectedCutoffDate });
  } else if (activeDates.length === 0 && !dohodRows && !divInfo) {
    warnings.push(`${ticker}: дивиденды не загружены`);
  }

  return warnings;
}

// ============ Payment sources ============
//
// Payments of one security come from one source at a time: the preferred one (dohod.ru for
// dividends, Parus via heroincome-data for fund distributions) or MOEX as a fallback. Rows of
// two sources stored side by side would count every payment twice.

type PreferredSource = 'dohod' | 'parus';

/**
 * What a payment sync of one security came to:
 * - loaded — a source gave payments;
 * - no-source — every source answered and none has payments for it (not in the dohod.ru / Parus
 *   index, or listed there with nothing, and MOEX gave nothing either). Since autumn 2026 MOEX ISS
 *   serves no dividends at all, so this is the usual result for a security outside dohod.ru / Parus;
 * - unreachable — a source did not answer (offline, GitHub blocked, a file failed): try later.
 */
export type PaymentsOutcome = 'loaded' | 'no-source' | 'unreachable';

async function storedPayments(assetId: number): Promise<PaymentHistory[]> {
  return db.paymentHistory
    .where('[assetId+date]')
    .between([assetId, Dexie.minKey], [assetId, Dexie.maxKey])
    .toArray();
}

/** Dates of the asset's real (non-forecast) payments, oldest first — the basis of its frequency. */
async function storedPaymentDates(assetId: number): Promise<Date[]> {
  return (await storedPayments(assetId))
    .filter((r) => !r.isForecast)
    .map((r) => r.date)
    .sort((a, b) => a.getTime() - b.getTime());
}

async function deleteStoredPayments(
  assetId: number,
  type: PaymentHistory['type'],
  dataSource: DataSource,
): Promise<boolean> {
  const stale = (await storedPayments(assetId)).filter((r) => r.type === type && r.dataSource === dataSource);
  if (stale.length > 0) await db.paymentHistory.bulkDelete(stale.map((r) => r.id!));
  return stale.length > 0;
}

/** The preferred source answered: its rows replace whatever MOEX had given before. */
async function writeFromPreferred(
  assetId: number,
  rows: (DividendHistoryRow & { isForecast?: boolean })[],
  type: PaymentHistory['type'],
  source: PreferredSource,
): Promise<void> {
  await deleteStoredPayments(assetId, type, 'moex');
  await writePaymentHistory(assetId, rows, type, source);
}

/**
 * The preferred source gave nothing this time, so MOEX is next in line.
 * - Its rows are stored and it is merely unreachable (`dropped` is false: no index — offline,
 *   GitHub blocked — or one file failed to load): they stay as they are and MOEX is not asked.
 * - It no longer lists the security (`dropped`): MOEX takes over, and the old rows go only once
 *   MOEX has actually answered.
 * - Nothing of it is stored: plain fallback to MOEX.
 */
async function writeFromMoex(
  ra: ResolvedAsset,
  type: PaymentHistory['type'],
  preferred: PreferredSource,
  dropped: boolean,
): Promise<DividendResult | null> {
  const assetId = ra.asset.id!;
  const hasPreferredRows = (await storedPayments(assetId)).some((r) => r.type === type && r.dataSource === preferred);
  if (hasPreferredRows && !dropped) return null;

  const divInfo = await fetchDividends(ra.secid);
  if (divInfo) {
    if (hasPreferredRows) await deleteStoredPayments(assetId, type, preferred);
    await writePaymentHistory(assetId, divInfo.history, type, 'moex');
  }
  return divInfo;
}

/** Stock dividends: dohod.ru first, MOEX as a fallback. */
async function syncStockDividends(ra: ResolvedAsset): Promise<{
  dohodRows: Awaited<ReturnType<typeof fetchDohodDividends>>;
  divInfo: DividendResult | null;
  outcome: PaymentsOutcome;
}> {
  const ticker = ra.asset.ticker ?? ra.secid;
  const covered = await isDohodAvailable(ticker);
  const dohodRows = covered ? await fetchDohodDividends(ticker) : null;

  if (dohodRows) {
    await writeFromPreferred(ra.asset.id!, dohodRows, 'dividend', 'dohod');
    return { dohodRows, divInfo: null, outcome: dohodRows.length > 0 ? 'loaded' : 'no-source' };
  }

  const dropped = !covered && (await isDohodIndexLoaded());
  const divInfo = await writeFromMoex(ra, 'dividend', 'dohod', dropped);
  return { dohodRows: null, divInfo, outcome: moexOutcome(divInfo, dropped) };
}

/** After the preferred source gave nothing: MOEX loaded something, or every source said no. */
function moexOutcome(divInfo: DividendResult | null, noPreferred: boolean): PaymentsOutcome {
  if (divInfo && divInfo.history.length > 0) return 'loaded';
  return noPreferred ? 'no-source' : 'unreachable';
}

/** Fund distributions: heroincome-data (Parus) first, MOEX as a fallback. */
async function syncFundDistributions(ra: ResolvedAsset): Promise<{
  fundRows: Awaited<ReturnType<typeof fetchFundDistributions>>;
  outcome: PaymentsOutcome;
}> {
  const fundKey = await findFundKey(ra.asset.ticker, ra.asset.isin, ra.secid);
  const fundRows = fundKey ? await fetchFundDistributions(fundKey) : null;

  if (fundRows && fundRows.length > 0) {
    await writeFromPreferred(ra.asset.id!, fundRows, 'distribution', 'parus');
    return { fundRows, outcome: 'loaded' };
  }
  const dropped = !fundKey && (await isFundIndexLoaded());
  const divInfo = await writeFromMoex(ra, 'distribution', 'parus', dropped);
  // A listed fund whose file holds no payouts counts as "no source" too.
  return { fundRows, outcome: moexOutcome(divInfo, dropped || fundRows?.length === 0) };
}

async function writePaymentHistory(
  assetId: number,
  rows: (DividendHistoryRow & { isForecast?: boolean })[],
  type: PaymentHistory['type'],
  dataSource: DataSource = 'moex',
): Promise<void> {
  const existing = await db.paymentHistory
    .where('[assetId+date]')
    .between([assetId, Dexie.minKey], [assetId, Dexie.maxKey])
    .filter((r) => r.type === type && r.dataSource === dataSource)
    .toArray();

  // A date may carry several payments (two dividends with one record date), so rows are
  // matched per date as a multiset, never keyed by the date alone.
  const incoming = groupByDate(rows.map((row): Omit<PaymentHistory, 'id'> => ({
    assetId,
    amount: row.amount,
    date: row.date,
    type,
    dataSource,
    ...(row.isForecast ? { isForecast: true } : {}),
  })));
  const stored = groupByDate(existing);

  const toDelete: number[] = [];
  const toUpdate: { key: number; changes: Partial<PaymentHistory> }[] = [];
  const toAdd: Omit<PaymentHistory, 'id'>[] = [];
  const same = (a: Pick<PaymentHistory, 'amount' | 'isForecast'>, b: Pick<PaymentHistory, 'amount' | 'isForecast'>) =>
    a.amount === b.amount && (a.isForecast === true) === (b.isForecast === true);

  for (const [time, records] of stored) {
    const next = incoming.get(time) ?? [];
    // Unchanged rows keep their ids; the rest are paired up in order and updated in place.
    const leftover = records.filter((record) => {
      const i = next.findIndex((n) => same(n, record));
      if (i < 0) return true;
      next.splice(i, 1);
      return false;
    });
    for (const record of leftover) {
      const n = next.shift();
      if (n) toUpdate.push({ key: record.id!, changes: { amount: n.amount, isForecast: n.isForecast } });
      else toDelete.push(record.id!);
    }
    toAdd.push(...next);
    incoming.delete(time);
  }
  for (const records of incoming.values()) toAdd.push(...records);

  await db.transaction('rw', db.paymentHistory, async () => {
    if (toDelete.length > 0) await db.paymentHistory.bulkDelete(toDelete);
    if (toUpdate.length > 0) await db.paymentHistory.bulkUpdate(toUpdate);
    if (toAdd.length > 0) await db.paymentHistory.bulkAdd(toAdd);
  });
}

function groupByDate<T extends { date: Date }>(records: T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const record of records) {
    const time = record.date.getTime();
    const group = groups.get(time);
    if (group) group.push(record);
    else groups.set(time, [record]);
  }
  return groups;
}

// ============ Payment-only sync ============

export async function deleteManualPayments(assetId: number): Promise<number> {
  const manual = await db.paymentHistory
    .where('assetId').equals(assetId)
    .filter(p => p.dataSource === 'manual')
    .toArray();
  if (manual.length > 0) {
    await db.paymentHistory.bulkDelete(manual.map(p => p.id!));
  }
  return manual.length;
}

/**
 * Reloads the payments of one security. With `replaceManual` the user's own payments are
 * removed — but only once a source has actually given payments: if nothing is found they stay.
 * `outcome` is missing for a bond that got no coupons (MOEX does not tell "none yet" from an error).
 */
export async function syncAssetPayments(
  assetId: number,
  options?: { replaceManual?: boolean },
): Promise<{ success: boolean; error?: string; outcome?: PaymentsOutcome }> {
  const asset = await db.assets.get(assetId);
  if (!asset || !isSyncable(asset)) return { success: false, error: 'Не синхронизируемый актив' };

  try {
    const ra = await resolveAndCache(asset);
    if (!ra) return { success: false, error: 'Не найден на MOEX' };

    if (ra.market === 'bonds') {
      const couponHistory = await fetchCouponHistory(ra.secid);
      if (couponHistory.length === 0) return { success: true };
      await writePaymentHistory(ra.asset.id!, couponHistory, 'coupon');
      if (options?.replaceManual) await deleteManualPayments(ra.asset.id!);
      return { success: true, outcome: 'loaded' };
    }

    const { outcome } = ra.asset.type === 'Фонды'
      ? await syncFundDistributions(ra)
      : await syncStockDividends(ra);
    if (options?.replaceManual && outcome === 'loaded') await deleteManualPayments(ra.asset.id!);

    const activeDates = await storedPaymentDates(ra.asset.id!);
    if (activeDates.length >= 2) {
      await updateMoexAssetFields(ra.asset, { frequencyPerYear: calcDividendFrequency(activeDates) });
    }

    return { success: true, outcome };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ Helpers ============

async function updateMoexAssetFields(
  asset: Asset,
  data: {
    frequencyPerYear: number;
    nextExpectedDate?: Date;
    nextExpectedCutoffDate?: Date;
  },
): Promise<void> {
  const updates: Partial<Asset> = {};

  updates.moexFrequency = data.frequencyPerYear;

  if (asset.frequencySource !== 'manual') {
    updates.frequencyPerYear = data.frequencyPerYear;
    updates.frequencySource = 'moex';
  }

  if (data.nextExpectedDate) updates.nextExpectedDate = data.nextExpectedDate;
  if (data.nextExpectedCutoffDate) updates.nextExpectedCutoffDate = data.nextExpectedCutoffDate;

  await db.assets.update(asset.id!, updates);
}
