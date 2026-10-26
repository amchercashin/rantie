import { useCallback, useEffect, useState } from 'react';
import { getProtectionState, requestProtection, type ProtectionState } from '@/lib/storage-protection';

/** Current protection state (null while unknown) and a user-triggered request. */
export function useStorageProtection() {
  const [state, setState] = useState<ProtectionState | null>(null);

  useEffect(() => {
    let alive = true;
    void getProtectionState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const request = useCallback(async () => {
    const next = await requestProtection();
    setState(next);
    return next;
  }, []);

  return { state, request };
}
