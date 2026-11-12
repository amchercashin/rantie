import { db } from '@/db/database';

const NDFL_PREFIX = 'ndfl-';

export async function updateAppSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export async function clearAllData(): Promise<void> {
  await db.delete();
  await db.open();
}

/**
 * Rate a category gets until the user picks one. 13% is what most people pay on dividends,
 * coupons and deposit interest; an over-taxed estimate is safer than a gross one shown as net.
 */
export const DEFAULT_NDFL_RATE = 13;

/**
 * Rates for every category in the portfolio: the user's choice where saved,
 * DEFAULT_NDFL_RATE otherwise. Pure calculators treat a missing key as 0%, so the
 * default must be filled in here — this is the one place the app reads rates from.
 */
export async function getNdflRates(): Promise<Map<string, number>> {
  // Plain reads only: Safari can fail an index cursor (`orderBy('type').uniqueKeys()`) with
  // "UnknownError: Unable to open cursor" after assets are deleted, and the app then never starts.
  const [rows, assets] = await Promise.all([
    db.settings.toArray(),
    db.assets.toArray(),
  ]);
  const types = new Set(assets.map((a) => a.type));
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.key.startsWith(NDFL_PREFIX)) {
      const category = row.key.slice(NDFL_PREFIX.length);
      const rate = Number(row.value);
      if (isFinite(rate)) map.set(category, rate);
    }
  }
  for (const type of types) {
    if (typeof type === 'string' && !map.has(type)) map.set(type, DEFAULT_NDFL_RATE);
  }
  return map;
}

export async function updateNdflRate(category: string, rate: number): Promise<void> {
  await db.settings.put({ key: `${NDFL_PREFIX}${category}`, value: String(rate) });
}

/**
 * A rate for one account inside one category, overriding the category rate for that account's
 * holdings of it (e.g. 0% for the shares on an ИИС). Kept in the settings table, so it travels
 * with the backup; the key doesn't start with `ndfl-`, so getNdflRates never takes it for a category.
 */
const ACCOUNT_NDFL_PREFIX = 'ndfl@';

export function accountNdflKey(accountId: number, category: string): string {
  return `${ACCOUNT_NDFL_PREFIX}${accountId}:${category}`;
}

/** accountId → category → rate, for the accounts with an own rate somewhere. */
export async function getAccountNdflRates(): Promise<Map<number, Map<string, number>>> {
  const rows = (await db.table('settings').toArray()) as { key: string; value: string }[];
  const map = new Map<number, Map<string, number>>();
  for (const row of rows) {
    if (!row.key.startsWith(ACCOUNT_NDFL_PREFIX)) continue;
    const rest = row.key.slice(ACCOUNT_NDFL_PREFIX.length);
    const sep = rest.indexOf(':');
    const accountId = Number(rest.slice(0, sep));
    const category = rest.slice(sep + 1);
    const rate = Number(row.value);
    if (sep <= 0 || !Number.isInteger(accountId) || !category || !isFinite(rate)) continue;
    const byCategory = map.get(accountId) ?? new Map<string, number>();
    byCategory.set(category, rate);
    map.set(accountId, byCategory);
  }
  return map;
}

/** null removes the account's own rate: it follows the category again. */
export async function updateAccountNdflRate(accountId: number, category: string, rate: number | null): Promise<void> {
  const key = accountNdflKey(accountId, category);
  if (rate == null) await db.table('settings').delete(key);
  else await db.table('settings').put({ key, value: String(rate) });
}

/** Drop every own rate of an account (it is being deleted). Call inside a transaction on `settings`. */
export async function deleteAccountNdflRates(accountId: number): Promise<void> {
  const prefix = `${ACCOUNT_NDFL_PREFIX}${accountId}:`;
  const keys = ((await db.table('settings').toArray()) as { key: string }[])
    .map((row) => row.key)
    .filter((key) => key.startsWith(prefix));
  if (keys.length) await db.table('settings').bulkDelete(keys);
}

/**
 * "НДФЛ 0%" (or "НДФЛ 0–13%" when its categories differ) for an account with an own rate in one of
 * the categories it holds; null when every category it holds just follows the category rate.
 */
export function accountNdflLabel(
  categories: string[],
  categoryRates: Map<string, number>,
  ownRates: Map<string, number> | undefined,
): string | null {
  if (!ownRates || !categories.some((c) => ownRates.has(c))) return null;
  const rates = categories.map((c) => ownRates.get(c) ?? categoryRates.get(c) ?? DEFAULT_NDFL_RATE);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const num = (r: number) => String(Math.round(r * 100) / 100).replace('.', ',');
  return min === max ? `НДФЛ\u00a0${num(min)}%` : `НДФЛ\u00a0${num(min)}–${num(max)}%`;
}

