import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Holding } from '@/models/account';

export function useHoldings() {
  return useLiveQuery(() => db.holdings.toArray()) ?? [];
}

export function useHoldingsByAsset(assetId: number) {
  return useLiveQuery(
    () => db.holdings.where('assetId').equals(assetId).toArray(),
    [assetId],
  ) ?? [];
}

export async function addHolding(holding: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>): Promise<number> {
  const now = new Date();
  return (await db.holdings.add({ ...holding, createdAt: now, updatedAt: now })) as number;
}

export async function updateHolding(id: number, changes: Partial<Holding>): Promise<void> {
  await db.holdings.update(id, { ...changes, updatedAt: new Date() });
}

export async function deleteHolding(id: number): Promise<void> {
  await db.transaction('rw', db.holdings, db.assets, db.paymentHistory, async () => {
    const holding = await db.holdings.get(id);
    if (!holding) return;

    await db.holdings.delete(id);

    // Mark remaining holdings in the same account as manual (portfolio manually modified)
    await db.holdings.where('accountId').equals(holding.accountId)
      .modify({ quantitySource: 'manual', updatedAt: new Date() });

    const remaining = await db.holdings.where('assetId').equals(holding.assetId).count();
    if (remaining === 0) {
      await db.paymentHistory.where('assetId').equals(holding.assetId).delete();
      await db.assets.delete(holding.assetId);
    }
  });
}
