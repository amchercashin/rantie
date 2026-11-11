import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import type { SyncResult } from '@/services/moex-sync';
import { getLastSyncAt, getLastPriceSyncAt } from '@/services/sync-state';

/**
 * The sync itself (MOEX, dohod.ru, rates) is loaded when it is first needed, not with the app:
 * most starts find fresh prices and never run it.
 */
const loadSync = () => import('@/services/moex-sync');

interface SyncContextValue {
  syncing: boolean;
  lastSyncAt: Date | null;
  error: string | null;
  warning: string | null;
  triggerSync: () => Promise<SyncResult | null>;
  syncAsset: (assetId: number) => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);
const PRICE_SYNC_STALE_MS = 4 * 60 * 60 * 1000;

export function SyncProvider({ children }: { children: ReactNode }) {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const triggerSync = useCallback(async (): Promise<SyncResult | null> => {
    if (syncingRef.current) return null;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    setWarning(null);
    try {
      const { syncAllAssets } = await loadSync();
      const result = await syncAllAssets();
      if (result.synced > 0) {
        setLastSyncAt(new Date());
      }
      if (result.failed > 0) {
        setError(`Ошибки: ${result.errors.join(', ')}`);
      }
      if (result.warnings.length > 0) {
        setWarning(result.warnings.join(', '));
      }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  const syncAsset = useCallback(async (assetId: number): Promise<void> => {
    // Skip if full sync is running — it will cover this asset
    if (syncingRef.current) return;
    try {
      const { syncSingleAsset } = await loadSync();
      await syncSingleAsset(assetId);
    } catch {
      /* callers fire and forget: the asset is refreshed by the next full sync */
    }
  }, []);

  const triggerPriceSyncIfStale = useCallback(async (): Promise<void> => {
    if (syncingRef.current) return;
    const lastPriceSyncAt = await getLastPriceSyncAt();
    const isStale = !lastPriceSyncAt || Date.now() - lastPriceSyncAt.getTime() > PRICE_SYNC_STALE_MS;
    if (!isStale) {
      setLastSyncAt(lastPriceSyncAt);
      return;
    }

    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      const { syncAllAssets } = await loadSync();
      const result = await syncAllAssets({ pricesOnly: true });
      if (result.synced > 0) setLastSyncAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Auto-sync prices on mount when stale; full payment sync remains manual.
  useEffect(() => {
    Promise.all([getLastPriceSyncAt(), getLastSyncAt()]).then(([lastPrice, lastFull]) => {
      setLastSyncAt(lastPrice ?? lastFull);
    });
    triggerPriceSyncIfStale();
  }, [triggerPriceSyncIfStale]);

  return (
    <SyncContext.Provider value={{ syncing, lastSyncAt, error, warning, triggerSync, syncAsset }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider');
  return ctx;
}
