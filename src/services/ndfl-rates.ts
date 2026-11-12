/**
 * NDFL rates are set per account (Настройки → НДФЛ): an ИИС with the tax break at 0%, a folder of
 * rent as self-employed at 4%, a broker account at 13%. They live in the settings table under
 * `ndfl@{accountId}`, so they travel with the backup. Pure helpers — no database access here,
 * so the backup import can use them too.
 */

/**
 * Rate an account gets until the user picks one. 13% is what most people pay on dividends,
 * coupons and deposit interest; an over-taxed estimate is safer than a gross one shown as net.
 */
export const DEFAULT_NDFL_RATE = 13;

const ACCOUNT_PREFIX = 'ndfl@';
/** Before rates moved to accounts: `ndfl-{category}`, and for a while `ndfl@{account}:{category}`. */
const LEGACY_CATEGORY_PREFIX = 'ndfl-';
const LEGACY_ACCOUNT_CATEGORY = /^ndfl@(\d+):(.+)$/s;
/**
 * Set once the old rates were carried over. The old keys stay (the previous app version still
 * reads them, so rolling back keeps the user's category rates); this marker stops a second pass.
 * Neither `ndfl-…` nor `ndfl@{digits}`, so no version of the app takes it for a rate.
 */
export const NDFL_MIGRATED_KEY = 'ndfl@migrated';

export interface SettingRow {
  key: string;
  value: string;
}

export function ndflKey(accountId: number): string {
  return `${ACCOUNT_PREFIX}${accountId}`;
}

/** "НДФЛ 0%" under an account in Счета — only when its rate isn't the default. */
export function ndflAccountLabel(rate: number | undefined): string | null {
  if (rate == null || rate === DEFAULT_NDFL_RATE) return null;
  return `НДФЛ\u00a0${String(Math.round(rate * 100) / 100).replace('.', ',')}%`;
}

/** The account a setting key holds the rate of, or null for any other key. */
export function ndflKeyAccount(key: string): number | null {
  if (!key.startsWith(ACCOUNT_PREFIX)) return null;
  const rest = key.slice(ACCOUNT_PREFIX.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/**
 * Rows that turn per-category rates into per-account ones, plus the marker; empty once done.
 * An account whose categories all came to one rate other than the default keeps it (e.g. every
 * category at 15%, or the ИИС's shares and bonds at 0%); an account with mixed rates can't be
 * expressed and gets the default. An account that already has its own rate keeps it.
 */
export function legacyNdflToAccounts(
  settings: SettingRow[],
  assets: { id?: number; type: string }[],
  holdings: { accountId: number; assetId: number }[],
): SettingRow[] {
  if (settings.some((row) => row.key === NDFL_MIGRATED_KEY)) return [];
  const categoryRates = new Map<string, number>();
  const accountCategoryRates = new Map<string, number>();
  const accountsWithRate = new Set<number>();

  for (const { key, value } of settings) {
    const rate = Number(value);
    if (key.startsWith(LEGACY_CATEGORY_PREFIX)) {
      if (isFinite(rate)) categoryRates.set(key.slice(LEGACY_CATEGORY_PREFIX.length), rate);
      continue;
    }
    const legacy = LEGACY_ACCOUNT_CATEGORY.exec(key);
    if (legacy) {
      if (isFinite(rate)) accountCategoryRates.set(`${legacy[1]}:${legacy[2]}`, rate);
      continue;
    }
    const accountId = ndflKeyAccount(key);
    if (accountId != null) accountsWithRate.add(accountId);
  }

  const typeByAsset = new Map(assets.filter((a) => a.id != null).map((a) => [a.id!, a.type]));
  const categoriesByAccount = new Map<number, Set<string>>();
  for (const h of holdings) {
    const type = typeByAsset.get(h.assetId);
    if (type == null) continue;
    const set = categoriesByAccount.get(h.accountId) ?? new Set<string>();
    set.add(type);
    categoriesByAccount.set(h.accountId, set);
  }

  const put: SettingRow[] = [];
  for (const [accountId, categories] of categoriesByAccount) {
    if (accountsWithRate.has(accountId)) continue;
    const rates = [...categories].map(
      (c) => accountCategoryRates.get(`${accountId}:${c}`) ?? categoryRates.get(c) ?? DEFAULT_NDFL_RATE,
    );
    if (rates.every((r) => r === rates[0]) && rates[0] !== DEFAULT_NDFL_RATE) {
      put.push({ key: ndflKey(accountId), value: String(rates[0]) });
    }
  }
  return [...put, { key: NDFL_MIGRATED_KEY, value: '1' }];
}
