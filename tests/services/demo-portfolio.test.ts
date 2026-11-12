import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/database';
import { clearAllData } from '@/services/app-settings';
import { DEMO_GOAL_PER_MONTH, getDemoAccountId, loadDemoPortfolio, removeDemoPortfolio } from '@/services/demo-portfolio';
import { getIncomeGoal, setIncomeGoal } from '@/services/income-goal';
import { calculatePortfolioSnapshot } from '@/services/portfolio-calculator';

describe('demo portfolio', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('creates a self-contained account with income', async () => {
    const now = new Date('2026-09-25T12:00:00');
    const accountId = await loadDemoPortfolio(now);
    expect(await getDemoAccountId()).toBe(accountId);

    const [assets, holdings, paymentHistory] = await Promise.all([
      db.assets.toArray(), db.holdings.toArray(), db.paymentHistory.toArray(),
    ]);
    expect(assets.length).toBeGreaterThan(5);
    expect(holdings.every((h) => h.accountId === accountId)).toBe(true);
    expect(paymentHistory.every((p) => p.date <= now || p.isForecast)).toBe(true);

    const snapshot = calculatePortfolioSnapshot({
      assets, holdings, paymentHistory, ndflRates: new Map(), exchangeRates: new Map(), now,
    });
    expect(snapshot.portfolio.totalIncomePerMonth).toBeGreaterThan(10_000);
    expect(new Set(snapshot.categories.map((c) => c.type)).size).toBe(5);
  });

  it('is idempotent', async () => {
    const a = await loadDemoPortfolio();
    const b = await loadDemoPortfolio();
    expect(a).toBe(b);
    expect(await db.accounts.count()).toBe(1);
  });

  it('removes only demo records', async () => {
    const now = new Date();
    const ownAccount = (await db.accounts.add({ name: 'Мой', createdAt: now, updatedAt: now })) as number;
    await loadDemoPortfolio();
    await removeDemoPortfolio();

    expect(await getDemoAccountId()).toBeNull();
    const accounts = await db.accounts.toArray();
    expect(accounts.map((a) => a.id)).toEqual([ownAccount]);
    expect(await db.assets.count()).toBe(0);
    expect(await db.paymentHistory.count()).toBe(0);
  });
});

describe('demo portfolio income', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it.each(['2026-09-03T12:00:00', '2026-09-25T12:00:00'])('keeps every income pocket filled on %s', async (iso) => {
    const now = new Date(iso);
    await loadDemoPortfolio(now);
    const [assets, holdings, paymentHistory] = await Promise.all([db.assets.toArray(), db.holdings.toArray(), db.paymentHistory.toArray()]);
    const snapshot = calculatePortfolioSnapshot({ assets, holdings, paymentHistory, ndflRates: new Map(), exchangeRates: new Map(), now });
    for (const asset of assets) {
      expect(snapshot.assetsById.get(asset.id!)!.incomePerMonth, asset.name).toBeGreaterThan(0);
    }
    const rent = assets.find((a) => a.type === 'Недвижимость')!;
    expect(snapshot.assetsById.get(rent.id!)!.incomePerMonth).toBe(42_000);
  });
});

describe('demo portfolio sources', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('labels securities payments with their real sources, rent as manual', async () => {
    await loadDemoPortfolio(new Date('2026-09-25T12:00:00'));
    const [assets, history] = await Promise.all([db.assets.toArray(), db.paymentHistory.toArray()]);
    const sourceOf = (type: string) => {
      const ids = new Set(assets.filter((a) => a.type === type).map((a) => a.id));
      return new Set(history.filter((p) => ids.has(p.assetId)).map((p) => p.dataSource));
    };
    expect(sourceOf('Акции')).toEqual(new Set(['dohod']));
    expect(sourceOf('Облигации')).toEqual(new Set(['moex']));
    expect(sourceOf('Фонды')).toEqual(new Set(['parus']));
    expect(sourceOf('Недвижимость')).toEqual(new Set(['manual']));
  });
});

describe('demo goal', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('sets a goal of its own, so the goal page has something to show', async () => {
    await loadDemoPortfolio();
    expect(await getIncomeGoal()).toBe(DEMO_GOAL_PER_MONTH);
  });

  it('leaves the user’s own goal alone, and keeps it after the demo is removed', async () => {
    await setIncomeGoal(250_000);
    await loadDemoPortfolio();
    expect(await getIncomeGoal()).toBe(250_000);
    await removeDemoPortfolio();
    expect(await getIncomeGoal()).toBe(250_000);
  });

  it('takes its goal away with the demo', async () => {
    await loadDemoPortfolio();
    await removeDemoPortfolio();
    expect(await getIncomeGoal()).toBeNull();
  });

  it('keeps a goal the user changed while looking at the demo', async () => {
    await loadDemoPortfolio();
    await setIncomeGoal(120_000);
    await removeDemoPortfolio();
    expect(await getIncomeGoal()).toBe(120_000);
  });
});
