import { useLiveQuery } from 'dexie-react-hooks';
import { getIncomeGoal } from '@/services/income-goal';

/** Monthly income goal: a number, null when not set, undefined while loading. */
export function useIncomeGoal(): number | null | undefined {
  return useLiveQuery(() => getIncomeGoal(), []);
}
