import { db } from '@/db/database';
import { DEFAULT_NDFL_RATE, legacyNdflToAccounts, ndflKey, ndflKeyAccount } from './ndfl-rates';

export async function updateAppSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  await db.delete();
  await db.open();
}

export { DEFAULT_NDFL_RATE } from './ndfl-rates';

/**
 * Rate of every account: the user's choice where saved, DEFAULT_NDFL_RATE otherwise. Pure
 * calculators treat a missing account as 0%, so the default must be filled in here — this is
 * the one place the app reads rates from.
 */
export async function getNdflRates(): Promise<Map<number, number>> {
  // Plain reads only: Safari can fail an index cursor with "UnknownError: Unable to open cursor"
  // after records are deleted, and the app then never starts.
  const [rows, accounts] = await Promise.all([db.settings.toArray(), db.accounts.toArray()]);
  const saved = new Map<number, number>();
  for (const row of rows) {
    const accountId = ndflKeyAccount(row.key);
    const rate = Number(row.value);
    if (accountId != null && isFinite(rate)) saved.set(accountId, rate);
  }
  const map = new Map<number, number>();
  for (const account of accounts) {
    if (account.id != null) map.set(account.id, saved.get(account.id) ?? DEFAULT_NDFL_RATE);
  }
  return map;
}

export async function updateNdflRate(accountId: number, rate: number): Promise<void> {
  await db.settings.put({ key: ndflKey(accountId), value: String(rate) });
}

/** The account is being deleted. Call inside a transaction that includes `settings`. */
export async function deleteNdflRate(accountId: number): Promise<void> {
  await db.settings.delete(ndflKey(accountId));
}

/**
 * Once per database: rates set per category before they moved to accounts become account rates
 * (see legacyNdflToAccounts). Runs at startup; a no-op once the marker is there.
 */
export async function migrateNdflToAccounts(): Promise<void> {
  await db.transaction('rw', [db.settings, db.assets, db.holdings], async () => {
    const [settings, assets, holdings] = await Promise.all([db.settings.toArray(), db.assets.toArray(), db.holdings.toArray()]);
    const rows = legacyNdflToAccounts(settings, assets, holdings);
    if (rows.length) await db.settings.bulkPut(rows);
  });
}
