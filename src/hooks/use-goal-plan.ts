import { useLiveQuery } from 'dexie-react-hooks';
import { getGoalPlan, type GoalPlan } from '@/services/income-goal';

/** Top-ups and the yield of one's own from the goal page; undefined while loading. */
export function useGoalPlan(): GoalPlan | undefined {
  return useLiveQuery(() => getGoalPlan(), []);
}
