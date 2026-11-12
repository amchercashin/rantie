import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Account } from '@/models/account';
import { deleteNdflRate } from '@/services/app-settings';

export function useAccounts() {
  return useLiveQuery(() => db.accounts.toArray()) ?? [];
}

export async function addAccount(name: string): Promise<number> {
  const now = new Date();
  return (await db.accounts.add({ name, createdAt: now, updatedAt: now })) as number;
}

export async function updateAccount(id: number, changes: Partial<Account>): Promise<void> {
  await db.accounts.update(id, { ...changes, updatedAt: new Date() });
}

export async function deleteAccount(id: number): Promise<void> {
  await db.transaction('rw', [db.accounts, db.holdings, db.assets, db.paymentHistory, db.table('settings')], async () => {
    const holdings = await db.holdings.where('accountId').equals(id).toArray();
    const assetIds = holdings.map(h => h.assetId);

    await db.holdings.where('accountId').equals(id).delete();

    for (const assetId of assetIds) {
      const remaining = await db.holdings.where('assetId').equals(assetId).count();
      if (remaining === 0) {
        await db.paymentHistory.where('assetId').equals(assetId).delete();
        await db.assets.delete(assetId);
      }
    }

    await deleteNdflRate(id);
    await db.accounts.delete(id);
  });
}
