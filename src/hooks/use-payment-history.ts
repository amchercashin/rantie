import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import { db } from '@/db/database';
import type { PaymentHistory } from '@/models/types';

export function usePaymentHistory(assetId: number) {
  return useLiveQuery(
    () =>
      Number.isFinite(assetId)
        ? db.paymentHistory.where('[assetId+date]')
            .between([assetId, Dexie.minKey], [assetId, Dexie.maxKey])
            .toArray()
        : [],
    [assetId],
    [],
  );
}

export function useAllPaymentHistory() {
  return useLiveQuery(() => db.paymentHistory.toArray(), [], []);
}

export async function deletePayment(id: number): Promise<void> {
  await db.paymentHistory.delete(id);
}

export async function addPayment(payment: Omit<PaymentHistory, 'id'>): Promise<void> {
  await db.paymentHistory.add(payment);
}
