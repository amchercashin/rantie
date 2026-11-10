import { db } from '@/db/database';
import type { ImportAssetRow } from './import-parser';
import { computeImportDiff, type ImportDiff } from './import-diff';

/** One account touched by an import. */
export interface AccountImport {
  /** null — a new account will be created */
  accountId: number | null;
  /** Existing account's name, or the suggested name of a new one */
  name: string;
  diff: ImportDiff;
}

/** The table names several accounts but the import was opened from one account. */
export class SeveralAccountsError extends Error {
  constructor(readonly accountNames: string[]) {
    super('Import table lists several accounts');
  }
}

const normName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export interface AccountGroup {
  /** Account named in the table; undefined — rows without an account */
  name?: string;
  rows: ImportAssetRow[];
}

/** Splits rows by their «Счёт», keeping the table order. */
export function groupRowsByAccount(rows: ImportAssetRow[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const row of rows) {
    const name = row.account?.trim() || undefined;
    const key = name ? normName(name) : '';
    let group = groups.get(key);
    if (!group) {
      group = { name, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

/**
 * Turns imported rows into per-account diffs.
 * - Opened from an account: every row goes there; a table with several accounts is refused.
 * - Opened from «Импорт отчёта»: rows are grouped by «Счёт». A group named like an
 *   existing account updates it (positions missing from the table are removed, as on
 *   any re-import); otherwise a new account is created. Rows without an account go to
 *   a new account called `defaultName` — never matched, so a generic name can't
 *   overwrite an account by accident.
 */
export async function planImport(
  rows: ImportAssetRow[],
  target: { accountId: number | null; defaultName: string },
): Promise<AccountImport[]> {
  const groups = groupRowsByAccount(rows);

  if (target.accountId !== null) {
    const named = groups.filter((g) => g.name);
    if (named.length > 1) throw new SeveralAccountsError(named.map((g) => g.name!));
    const account = await db.accounts.get(target.accountId);
    return [{
      accountId: target.accountId,
      name: account?.name ?? target.defaultName,
      diff: await computeImportDiff(rows, target.accountId),
    }];
  }

  const accounts = await db.accounts.toArray();
  const byName = new Map(accounts.map((a) => [normName(a.name), a]));
  const plan: AccountImport[] = [];
  for (const group of groups) {
    const existing = group.name ? byName.get(normName(group.name)) : undefined;
    const accountId = existing?.id ?? null;
    plan.push({
      accountId,
      name: existing?.name ?? group.name ?? target.defaultName,
      diff: await computeImportDiff(group.rows, accountId),
    });
  }
  return plan;
}
