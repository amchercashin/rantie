/**
 * Income goal: how much the portfolio should pay per month for the owner to live on it.
 * Stored in the Dexie `settings` table (so it travels with the backup) as a monthly net amount —
 * the same "after NDFL, per month" money the hero number shows.
 */
import { db } from '@/db/database';
import { plural } from '@/lib/utils';

export const INCOME_GOAL_KEY = 'income-goal-month';

export async function getIncomeGoal(): Promise<number | null> {
  const row = await db.settings.get(INCOME_GOAL_KEY);
  if (!row) return null;
  const value = Number(row.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Pass null to remove the goal. */
export async function setIncomeGoal(perMonth: number | null): Promise<void> {
  if (perMonth == null || !Number.isFinite(perMonth) || perMonth <= 0) {
    await db.settings.delete(INCOME_GOAL_KEY);
    return;
  }
  await db.settings.put({ key: INCOME_GOAL_KEY, value: String(Math.round(perMonth)) });
}

/**
 * The plan on the goal page: top-ups and, optionally, a yield of one's own to forecast with.
 * Kept in `settings` next to the goal, so it travels with the backup too.
 */
export interface GoalPlan {
  /** Top-up every month, RUB; 0 = none. */
  monthly: number;
  /** Extra top-up once a year, RUB; 0 = none. */
  yearly: number;
  /** Net yield per year, %, the user chose; null = the portfolio's own. */
  customYield: number | null;
}

const PLAN_MONTHLY_KEY = 'goal-plan-monthly';
const PLAN_YEARLY_KEY = 'goal-plan-yearly';
const PLAN_YIELD_KEY = 'goal-plan-yield';

function storedNumber(row: { value: string } | undefined): number | null {
  if (!row) return null;
  const value = Number(row.value);
  return Number.isFinite(value) ? value : null;
}

export async function getGoalPlan(): Promise<GoalPlan> {
  const [monthly, yearly, customYield] = await db.settings.bulkGet([PLAN_MONTHLY_KEY, PLAN_YEARLY_KEY, PLAN_YIELD_KEY]);
  return {
    monthly: Math.max(0, storedNumber(monthly) ?? 0),
    yearly: Math.max(0, storedNumber(yearly) ?? 0),
    customYield: storedNumber(customYield),
  };
}

/** Saves only the fields passed. A top-up of 0 and a yield of null remove the setting. */
export async function setGoalPlan(patch: Partial<GoalPlan>): Promise<void> {
  const amount = async (key: string, value: number | undefined) => {
    if (value === undefined) return;
    if (Number.isFinite(value) && value > 0) await db.settings.put({ key, value: String(Math.round(value)) });
    else await db.settings.delete(key);
  };
  await db.transaction('rw', db.settings, async () => {
    await amount(PLAN_MONTHLY_KEY, patch.monthly);
    await amount(PLAN_YEARLY_KEY, patch.yearly);
    if (patch.customYield !== undefined) {
      const y = patch.customYield;
      if (y != null && Number.isFinite(y)) await db.settings.put({ key: PLAN_YIELD_KEY, value: String(Math.round(y * 100) / 100) });
      else await db.settings.delete(PLAN_YIELD_KEY);
    }
  });
}

export interface GoalProgress {
  /** income / goal; may exceed 1. */
  ratio: number;
  /** Whole percent for display. Never 100 before the goal is reached, never 0 once there is income. */
  percent: number;
  reached: boolean;
  /** Cells of the strip: 30 days of a month, or 12 months of a year. */
  cells: number;
  /** How many cells the income pays for, fractional, capped at `cells`. */
  covered: number;
  /** "9 дней из 30", "3 месяца из 12", "меньше дня", "весь месяц". */
  coveredLabel: string;
}

/**
 * Progress toward the goal, told in the units of the selected period: the portfolio "pays for"
 * so many days of the month, or months of the year. Pure — both amounts are per month.
 */
export function goalProgress(incomePerMonth: number, goalPerMonth: number, period: 'month' | 'year'): GoalProgress {
  const cells = period === 'month' ? 30 : 12;
  const ratio = goalPerMonth > 0 && incomePerMonth > 0 ? incomePerMonth / goalPerMonth : 0;
  const reached = ratio >= 1;
  const covered = Math.min(ratio, 1) * cells;

  let percent = Math.floor(ratio * 100);
  if (!reached) percent = Math.min(99, Math.max(ratio > 0 ? 1 : 0, percent));

  const whole = Math.floor(covered + 1e-9);
  let coveredLabel: string;
  if (period === 'month') {
    if (reached) coveredLabel = 'весь месяц';
    else if (whole < 1) coveredLabel = ratio > 0 ? 'меньше дня' : '0 дней из 30';
    else coveredLabel = `${whole} ${plural(whole, ['день', 'дня', 'дней'])} из 30`;
  } else {
    if (reached) coveredLabel = 'весь год';
    else if (whole < 1) coveredLabel = ratio > 0 ? 'меньше месяца' : '0 месяцев из 12';
    else coveredLabel = `${whole} ${plural(whole, ['месяц', 'месяца', 'месяцев'])} из 12`;
  }

  return { ratio, percent, reached, cells, covered, coveredLabel };
}
