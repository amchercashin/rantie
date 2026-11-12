import { db } from '@/db/database';
import type { Asset, DataSource, PaymentHistory } from '@/models/types';
import { deleteAccount } from '@/hooks/use-accounts';
import { INCOME_GOAL_KEY } from '@/services/income-goal';

/**
 * A realistic sample portfolio to explore the app without entering data.
 * Everything lives in a dedicated account, so removing the demo never touches
 * the user's own records. Dates are generated relative to `now`.
 */
export const DEMO_ACCOUNT_SETTING = 'demo-account-id';
export const DEMO_ACCOUNT_NAME = 'Демо-портфель';
/** Goal the demo brings along when the user has none, so the goal and its forecast can be seen. */
export const DEMO_GOAL_PER_MONTH = 100_000;
/** Remembers the goal the demo set — removing the demo takes it away only while it is unchanged. */
const DEMO_GOAL_SETTING = 'demo-goal';

interface DemoAsset {
  asset: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>;
  quantity: number;
  averagePrice?: number;
  /** [months ago, amount per unit]; negative months = forecast (`isForecast`) */
  payments?: [number, number][];
  paymentType?: PaymentHistory['type'];
  /** Where the payment history comes from (as after a real sync). */
  paymentSource?: DataSource;
}

function monthsAgo(now: Date, months: number, day: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - months, day, 12);
}

function stockHistory(latestMonthsAgo: number, amounts: number[], everyMonths = 12): [number, number][] {
  return amounts.map((amount, i) => [latestMonthsAgo + i * everyMonths, amount]);
}

const DEMO: DemoAsset[] = [
  {
    asset: {
      type: 'Акции', ticker: 'SBER', name: 'Сбербанк', currency: 'RUB', currentPrice: 312.4,
      dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'moex',
    },
    quantity: 400, averagePrice: 251,
    payments: [...stockHistory(2, [36.1, 34.84, 33.3, 25, 18.7, 18.7]), [-10, 38.4]],
    paymentType: 'dividend',
    paymentSource: 'dohod',
  },
  {
    asset: {
      type: 'Акции', ticker: 'LKOH', name: 'Лукойл', currency: 'RUB', currentPrice: 6980,
      dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 2, frequencySource: 'moex',
    },
    quantity: 12, averagePrice: 5240,
    payments: stockHistory(3, [498, 397, 541, 514, 498, 447], 6),
    paymentType: 'dividend',
    paymentSource: 'dohod',
  },
  {
    asset: {
      type: 'Акции', ticker: 'MTSS', name: 'МТС', currency: 'RUB', currentPrice: 228,
      dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'moex',
    },
    quantity: 300, averagePrice: 244,
    payments: stockHistory(2, [35, 35, 35, 34.29]),
    paymentType: 'dividend',
    paymentSource: 'dohod',
  },
  {
    asset: {
      type: 'Облигации', ticker: 'SU26238RMFS4', isin: 'RU000A1038V6', name: 'ОФЗ 26238', currency: 'RUB',
      currentPrice: 612, faceValue: 1000, moexMarket: 'bonds',
      dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 2, frequencySource: 'moex',
    },
    quantity: 150, averagePrice: 640,
    payments: stockHistory(4, [35.4, 35.4, 35.4, 35.4, 35.4], 6),
    paymentType: 'coupon',
    paymentSource: 'moex',
  },
  {
    asset: {
      type: 'Фонды', ticker: 'RU000A104KU3', isin: 'RU000A104KU3', name: 'Парус-Нордвей', currency: 'RUB', currentPrice: 1150,
      dataSource: 'moex', paymentPerUnitSource: 'fact', frequencyPerYear: 12, frequencySource: 'moex',
    },
    quantity: 40, averagePrice: 1000,
    payments: Array.from({ length: 20 }, (_, i) => [i + 1, Math.round((11.8 - i * 0.07) * 100) / 100] as [number, number]),
    paymentType: 'distribution',
    paymentSource: 'parus',
  },
  {
    asset: {
      type: 'Вклады', name: 'Вклад «Накопительный»', currency: 'RUB', currentPrice: 500_000,
      dataSource: 'manual', paymentPerUnit: 90_000, paymentPerUnitSource: 'manual', frequencyPerYear: 12, frequencySource: 'manual',
    },
    quantity: 1,
  },
  {
    asset: {
      type: 'Недвижимость', name: 'Студия у метро', currency: 'RUB', currentPrice: 6_500_000,
      dataSource: 'manual', paymentPerUnitSource: 'fact', frequencyPerYear: 12, frequencySource: 'manual',
    },
    quantity: 1,
    // Paid on the 5th; rent raised from 38 to 42 тыс four months ago.
    payments: Array.from({ length: 17 }, (_, i) => [i, i < 4 ? 42_000 : 38_000] as [number, number]),
    paymentType: 'rent',
  },
];

export async function getDemoAccountId(): Promise<number | null> {
  const row = await db.settings.get(DEMO_ACCOUNT_SETTING);
  if (!row) return null;
  const id = Number(row.value);
  if (!Number.isFinite(id)) return null;
  const account = await db.accounts.get(id);
  return account ? id : null;
}

export async function loadDemoPortfolio(now: Date = new Date()): Promise<number> {
  const existing = await getDemoAccountId();
  if (existing != null) return existing;

  return db.transaction('rw', [db.accounts, db.assets, db.holdings, db.paymentHistory, db.settings], async () => {
    const accountId = (await db.accounts.add({ name: DEMO_ACCOUNT_NAME, createdAt: now, updatedAt: now })) as number;

    for (const item of DEMO) {
      const assetId = (await db.assets.add({ ...item.asset, createdAt: now, updatedAt: now })) as number;
      await db.holdings.add({
        accountId,
        assetId,
        quantity: item.quantity,
        quantitySource: 'manual',
        averagePrice: item.averagePrice,
        createdAt: now,
        updatedAt: now,
      });
      for (const [ago, amount] of item.payments ?? []) {
        const date = monthsAgo(now, ago, item.asset.type === 'Недвижимость' ? 5 : 15);
        if (ago >= 0 && date > now) continue; // this month's payment hasn't happened yet
        await db.paymentHistory.add({
          assetId,
          amount,
          date,
          type: item.paymentType ?? 'other',
          dataSource: item.paymentSource ?? 'manual',
          isForecast: ago < 0 ? true : undefined,
        });
      }
    }

    await db.settings.put({ key: DEMO_ACCOUNT_SETTING, value: String(accountId) });
    if (!(await db.settings.get(INCOME_GOAL_KEY))) {
      await db.settings.put({ key: INCOME_GOAL_KEY, value: String(DEMO_GOAL_PER_MONTH) });
      await db.settings.put({ key: DEMO_GOAL_SETTING, value: String(DEMO_GOAL_PER_MONTH) });
    }
    return accountId;
  });
}

export async function removeDemoPortfolio(): Promise<void> {
  const id = await getDemoAccountId();
  if (id != null) await deleteAccount(id);
  await db.transaction('rw', db.settings, async () => {
    await db.settings.delete(DEMO_ACCOUNT_SETTING);
    const demoGoal = await db.settings.get(DEMO_GOAL_SETTING);
    if (demoGoal) {
      const goal = await db.settings.get(INCOME_GOAL_KEY);
      if (goal?.value === demoGoal.value) await db.settings.delete(INCOME_GOAL_KEY);
      await db.settings.delete(DEMO_GOAL_SETTING);
    }
  });
}
