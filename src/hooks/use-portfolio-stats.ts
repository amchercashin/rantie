import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import type { Asset, PortfolioStats, CategoryStats } from '@/models/types';
import { calculatePortfolioSnapshot, type CalculatedAssetStats } from '@/services/portfolio-calculator';
import { projectIncome, incomeTimeline, type ProjectedPayment, type TimelinePoint } from '@/services/income-projection';
import { getNdflRates } from '@/services/app-settings';
import { ratesArrayToMap } from '@/services/exchange-rates';

export function usePortfolioStats(options: { withTimeline?: boolean } = {}): {
  portfolio: PortfolioStats;
  categories: CategoryStats[];
  assetsById: Map<number, CalculatedAssetStats>;
  /** Held currencies with no rate to the ruble (left out of the totals). */
  missingRates: string[];
  assets: Asset[];
  /** Projected net payments for the next 12 months, soonest first. */
  projection: ProjectedPayment[];
  /** Monthly income history + forecast (only when `withTimeline`). */
  timeline: TimelinePoint[];
  isLoading: boolean;
} {
  const withTimeline = options.withTimeline ?? false;
  const assets = useLiveQuery(() => db.assets.toArray(), []);
  const holdings = useLiveQuery(() => db.holdings.toArray(), []);
  const allHistory = useLiveQuery(() => db.paymentHistory.toArray(), []);
  const ndflRates = useLiveQuery(() => getNdflRates(), []);
  const exchangeRates = useLiveQuery(() => db.exchangeRates.toArray(), []);
  const isLoading =
    assets === undefined ||
    holdings === undefined ||
    allHistory === undefined ||
    ndflRates === undefined ||
    exchangeRates === undefined;

  return useMemo(() => {
    const input = {
      assets: assets ?? [],
      holdings: holdings ?? [],
      paymentHistory: allHistory ?? [],
      ndflRates: ndflRates ?? new Map<string, number>(),
      exchangeRates: ratesArrayToMap(exchangeRates ?? []),
    };
    const { portfolio, categories, assetsById, missingRates } = calculatePortfolioSnapshot(input);
    const projectionInput = {
      assets: input.assets,
      paymentHistory: input.paymentHistory,
      assetsById,
      ndflRates: input.ndflRates,
    };
    const projection = projectIncome(projectionInput);
    const timeline = withTimeline && !isLoading ? incomeTimeline(projectionInput) : [];
    return { portfolio, categories, assetsById, missingRates, assets: input.assets, projection, timeline, isLoading };
  }, [assets, holdings, allHistory, ndflRates, exchangeRates, isLoading, withTimeline]);
}
