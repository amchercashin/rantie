import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Asset } from '@/models/types';

export function useAssets() {
  const assets = useLiveQuery(() => db.assets.toArray()) ?? [];
  return assets;
}

export function useAsset(id: number): Asset | null | undefined {
  return useLiveQuery(
    async () => {
      if (!Number.isFinite(id)) return null;
      return (await db.assets.get(id)) ?? null;
    },
    [id],
  );
}

export async function updateAsset(id: number, changes: Partial<Asset>): Promise<void> {
  await db.assets.update(id, { ...changes, updatedAt: new Date() });
}
