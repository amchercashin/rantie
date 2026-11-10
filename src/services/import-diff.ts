import { db } from '@/db/database';
import type { Asset } from '@/models/types';
import type { Holding } from '@/models/account';
import { prepareImportRows, type ImportAssetRow } from './import-parser';

export interface DiffChange {
  field: string;
  oldValue: string | number | undefined;
  newValue: string | number | undefined;
}

export type DiffStatus = 'added' | 'changed' | 'unchanged' | 'removed';

export interface DiffItem {
  status: DiffStatus;
  imported?: ImportAssetRow;      // undefined for 'removed' items
  existingAsset?: Asset;
  existingHolding?: Holding;
  changes: DiffChange[];
}

export interface ImportDiff {
  accountId: number | null;  // null = new account
  items: DiffItem[];
  summary: { added: number; changed: number; unchanged: number; removed: number };
}

export async function computeImportDiff(
  importedRows: ImportAssetRow[],
  accountId: number | null,
): Promise<ImportDiff> {
  const rows = prepareImportRows(importedRows);

  // 1. Load all assets (for global ticker/isin matching)
  const allAssets = await db.assets.toArray();
  const byTicker = new Map<string, Asset>();
  const byIsin = new Map<string, Asset>();
  for (const a of allAssets) {
    if (a.ticker) byTicker.set(a.ticker, a);
    if (a.isin) byIsin.set(a.isin, a);
  }

  // 2. If existing account, load its holdings
  const existingHoldings: Holding[] = accountId
    ? await db.holdings.where('accountId').equals(accountId).toArray()
    : [];
  const holdingByAssetId = new Map<number, Holding>();
  for (const h of existingHoldings) holdingByAssetId.set(h.assetId, h);

  const items: DiffItem[] = [];
  const matchedAssetIds = new Set<number>();

  // 3. For each imported row: match to existing asset by ticker/isin
  for (const row of rows) {
    const existingAsset =
      (row.isin ? byIsin.get(row.isin) : undefined) ??
      (row.ticker ? byTicker.get(row.ticker) : undefined);

    if (!existingAsset) {
      items.push({ status: 'added', imported: row, changes: [] });
    } else {
      matchedAssetIds.add(existingAsset.id!);
      const existingHolding = holdingByAssetId.get(existingAsset.id!);

      if (!existingHolding) {
        items.push({ status: 'added', imported: row, existingAsset, changes: [] });
      } else {
        const changes = compareFields(row, existingAsset, existingHolding);
        items.push({
          status: changes.length > 0 ? 'changed' : 'unchanged',
          imported: row,
          existingAsset,
          existingHolding,
          changes,
        });
      }
    }
  }

  // 4. Holdings in account NOT in import → 'removed'
  for (const holding of existingHoldings) {
    if (!matchedAssetIds.has(holding.assetId)) {
      const asset = allAssets.find(a => a.id === holding.assetId);
      items.push({ status: 'removed', existingAsset: asset, existingHolding: holding, changes: [] });
    }
  }

  return {
    accountId,
    items,
    summary: {
      added: items.filter(i => i.status === 'added').length,
      changed: items.filter(i => i.status === 'changed').length,
      unchanged: items.filter(i => i.status === 'unchanged').length,
      removed: items.filter(i => i.status === 'removed').length,
    },
  };
}

function compareFields(row: ImportAssetRow, _asset: Asset, holding: Holding): DiffChange[] {
  const changes: DiffChange[] = [];
  if (row.quantity !== holding.quantity)
    changes.push({ field: 'quantity', oldValue: holding.quantity, newValue: row.quantity });
  if (row.averagePrice != null && row.averagePrice !== holding.averagePrice)
    changes.push({ field: 'averagePrice', oldValue: holding.averagePrice, newValue: row.averagePrice });
  return changes;
}
