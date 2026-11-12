import { useLiveQuery } from 'dexie-react-hooks';
import { getNdflRates } from '@/services/app-settings';

const EMPTY_MAP = new Map<string, number>();

export function useNdflRates(): Map<string, number> {
  return useLiveQuery(() => getNdflRates(), []) ?? EMPTY_MAP;
}
