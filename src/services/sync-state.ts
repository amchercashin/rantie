import { db } from '@/db/database';

/**
 * When the exchange data was last refreshed. Kept in the `settings` table, apart from the sync
 * itself, so that reading the time at startup does not pull the whole sync code into the first load.
 */
const LAST_FULL_SYNC_KEY = 'lastSyncAt';
const LAST_PRICE_SYNC_KEY = 'lastPriceSyncAt';

async function readDate(key: string): Promise<Date | null> {
  const row = await db.settings.get(key);
  return row ? new Date(row.value) : null;
}

/** Prices, dividends and coupons. */
export function getLastSyncAt(): Promise<Date | null> {
  return readDate(LAST_FULL_SYNC_KEY);
}

/** Prices only (the automatic refresh at startup). */
export function getLastPriceSyncAt(): Promise<Date | null> {
  return readDate(LAST_PRICE_SYNC_KEY);
}

export async function markSynced(kind: 'full' | 'prices', at: Date = new Date()): Promise<void> {
  await db.settings.put({ key: kind === 'prices' ? LAST_PRICE_SYNC_KEY : LAST_FULL_SYNC_KEY, value: at.toISOString() });
}
