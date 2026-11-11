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
