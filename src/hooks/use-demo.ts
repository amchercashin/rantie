import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { DEMO_ACCOUNT_SETTING } from '@/services/demo-portfolio';

/** Id of the demo account while the demo portfolio is loaded, otherwise null. */
export function useDemoAccountId(): number | null {
  return useLiveQuery(async () => {
    const row = await db.settings.get(DEMO_ACCOUNT_SETTING);
    return row ? Number(row.value) : null;
  }, []) ?? null;
}
