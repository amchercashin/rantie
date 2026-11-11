import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Asset } from '@/models/types';

export function useAssets() {
  const assets = useLiveQuery(() => db.assets.toArray()) ?? [];
  return assets;
}

export function useAsset(id: number) {
  const asset = useLiveQuery(() => db.assets.get(id), [id]);
  return asset;
}

export async function updateAsset(id: number, changes: Partial<Asset>): Promise<void> {
  await db.assets.update(id, { ...changes, updatedAt: new Date() });
}
