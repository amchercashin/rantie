import { db } from '@/db/database';
import type { Asset, ImportRecord } from '@/models/types';
import { createAssetDraft } from './asset-factory';
import { normalizeCurrency } from './exchange-rates';
import type { ImportAssetRow } from './import-parser';
import type { ImportDiff } from './import-diff';

export interface ApplyTarget {
  diff: ImportDiff;
  /** Name for a new account (diff.accountId === null) */
  accountName?: string;
}

/**
 * Applies the diffs of one import — one per account — in a single transaction.
 * Additions and changes in every account go first, removals last: a security moved
 * from one account to another in the same table keeps its asset and payment history.
 */
export async function applyImportPlan(
  targets: ApplyTarget[],
  source: ImportRecord['source'],
): Promise<{ records: ImportRecord[]; accountIds: number[]; newAssetIds: number[] }> {
  const newAssetIds: number[] = [];
  const accountIds: number[] = [];
  const records: ImportRecord[] = [];
  const counts = targets.map(() => ({ itemsAdded: 0, itemsChanged: 0, itemsUnchanged: 0, itemsRemoved: 0 }));

  await db.transaction('rw', [db.accounts, db.assets, db.holdings, db.paymentHistory, db.importRecords], async () => {
    // Phase 1: accounts, additions, changes
    for (const [i, { diff, accountName }] of targets.entries()) {
      let accountId = diff.accountId;
      if (accountId == null) {
        const now = new Date();
        accountId = await db.accounts.add({ name: accountName!, createdAt: now, updatedAt: now }) as number;
      }
      accountIds.push(accountId);

      for (const item of diff.items) {
        switch (item.status) {
          case 'added': {
            const row = item.imported!;
            // The same new security may come in several accounts of one table:
            // the first one creates the asset, the rest reuse it.
            const existing = item.existingAsset ?? await findAsset(row);
            let assetId: number;
            if (existing) {
              assetId = existing.id!;
              await updateAssetFields(assetId, row);
            } else {
              assetId = await createAsset(row);
              newAssetIds.push(assetId);
            }
            const now = new Date();
            await db.holdings.add({
              accountId, assetId,
              quantity: row.quantity,
              quantitySource: 'import' as const,
              importedQuantity: row.quantity,
              averagePrice: row.averagePrice,
              createdAt: now, updatedAt: now,
            });
            counts[i].itemsAdded++;
            break;
          }
          case 'changed': {
            await db.holdings.update(item.existingHolding!.id!, {
              quantity: item.imported!.quantity,
              quantitySource: 'import' as const,
              importedQuantity: item.imported!.quantity,
              averagePrice: item.imported!.averagePrice ?? item.existingHolding!.averagePrice,
              updatedAt: new Date(),
            });
            await updateAssetFields(item.existingAsset!.id!, item.imported!);
            counts[i].itemsChanged++;
            break;
          }
          case 'unchanged':
            counts[i].itemsUnchanged++;
            break;
        }
      }
    }

    // Phase 2: removals
    for (const [i, { diff }] of targets.entries()) {
      for (const item of diff.items) {
        if (item.status !== 'removed') continue;
        const { id, assetId } = item.existingHolding!;
        await db.holdings.delete(id!);
        const remaining = await db.holdings.where('assetId').equals(assetId).count();
        if (remaining === 0) {
          await db.paymentHistory.where('assetId').equals(assetId).delete();
          await db.assets.delete(assetId);
        }
        counts[i].itemsRemoved++;
      }
    }

    for (const [i, accountId] of accountIds.entries()) {
      const record = { date: new Date(), source, accountId, ...counts[i] } as ImportRecord;
      await db.importRecords.add(record);
      records.push(record);
    }
  });

  return { records, accountIds, newAssetIds };
}

export async function applyImportDiff(
  diff: ImportDiff,
  source: ImportRecord['source'],
  accountName?: string,
): Promise<{ record: ImportRecord; accountId: number; newAssetIds: number[] }> {
  const { records, accountIds, newAssetIds } = await applyImportPlan([{ diff, accountName }], source);
  return { record: records[0], accountId: accountIds[0], newAssetIds };
}

async function findAsset(row: ImportAssetRow): Promise<Asset | undefined> {
  if (row.isin) {
    const byIsin = await db.assets.where('isin').equals(row.isin).first();
    if (byIsin) return byIsin;
  }
  if (row.ticker) return db.assets.where('ticker').equals(row.ticker).first();
  return undefined;
}

async function createAsset(row: ImportAssetRow): Promise<number> {
  return await db.assets.add(createAssetDraft({
    type: row.type,
    ticker: row.ticker,
    isin: row.isin,
    name: row.name,
    currentPrice: row.currentPrice ?? row.averagePrice,
    faceValue: row.faceValue,
    currency: row.currency,
    emitter: row.emitter,
    securityCategory: row.securityCategory,
    issueInfo: row.issueInfo,
    paymentPerUnit: row.lastPaymentAmount ?? undefined,
    paymentPerUnitSource: row.lastPaymentAmount ? 'manual' : 'fact',
    frequencyPerYear: row.frequencyPerYear,
    dataSource: 'import',
  })) as number;
}

async function updateAssetFields(assetId: number, row: ImportAssetRow): Promise<void> {
  const updates: Record<string, unknown> = {
    name: row.name, dataSource: 'import', updatedAt: new Date(),
  };
  if (row.currentPrice != null) updates.currentPrice = row.currentPrice;
  if (row.faceValue != null) updates.faceValue = row.faceValue;
  if (row.isin) updates.isin = row.isin;
  if (row.currency) updates.currency = normalizeCurrency(row.currency);
  if (row.emitter) updates.emitter = row.emitter;
  if (row.securityCategory) updates.securityCategory = row.securityCategory;
  if (row.issueInfo) updates.issueInfo = row.issueInfo;
  if (row.lastPaymentAmount != null) {
    updates.paymentPerUnit = row.lastPaymentAmount;
    updates.paymentPerUnitSource = 'manual';
  }
  if (row.frequencyPerYear != null) {
    updates.frequencyPerYear = row.frequencyPerYear;
    updates.frequencySource = 'manual';
  }
  await db.assets.update(assetId, updates);
}
