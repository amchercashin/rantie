import { useLiveQuery } from 'dexie-react-hooks';
import { getAccountNdflRates, getNdflRates } from '@/services/app-settings';

const EMPTY_MAP = new Map<string, number>();
const EMPTY_ACCOUNT_MAP = new Map<number, Map<string, number>>();

export function useNdflRates(): Map<string, number> {
  return useLiveQuery(() => getNdflRates(), []) ?? EMPTY_MAP;
}

/** accountId → category → own rate, for accounts that override a category rate. */
export function useAccountNdflRates(): Map<number, Map<string, number>> {
  return useLiveQuery(() => getAccountNdflRates(), []) ?? EMPTY_ACCOUNT_MAP;
}
