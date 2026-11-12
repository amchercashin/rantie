import { useLiveQuery } from 'dexie-react-hooks';
import { getNdflRates } from '@/services/app-settings';

const EMPTY_MAP = new Map<number, number>();

/** accountId → NDFL rate, % (every account; 13% until the user picks one). */
export function useNdflRates(): Map<number, number> {
  return useLiveQuery(() => getNdflRates(), []) ?? EMPTY_MAP;
}
