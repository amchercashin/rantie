import type { Asset, AssetStats, CategoryStats, PaymentHistory, PortfolioStats } from '@/models/types';
import type { Holding } from '@/models/account';
import {
  calcAssetAnnualIncomePerUnit,
  calcAssetIncomePerMonth,
  calcYieldPercent,
  type PaymentRecord,
} from './income-calculator';
import { getRateToRub, normalizeCurrency } from './exchange-rates';
import { incomeSpreadOf } from '@/models/asset-kind';

export interface CalculatedAssetStats extends AssetStats {
  assetId: number;
  totalQuantity: number;
  annualIncomePerUnit: number;
  incomePerYear: number;
  currency: string;
  rateToRub: number;
  /** Foreign currency without a rate: value and income are unknown, not zero. */
  rateMissing: boolean;
}

export interface PortfolioSnapshot {
  portfolio: PortfolioStats;
  categories: CategoryStats[];
  assetsById: Map<number, CalculatedAssetStats>;
  /** Held currencies with no rate to the ruble — those assets are left out of the totals. */
  missingRates: string[];
}

export interface PortfolioCalculationInput {
  assets: Asset[];
  holdings: Holding[];
  paymentHistory: PaymentHistory[];
  ndflRates: Map<string, number>;
  exchangeRates: Map<string, number>;
  now?: Date;
}

/**
 * Yield of a portfolio or a category: income of the assets with a known value ÷ their value.
 * Income without a price would otherwise inflate it, and the goal forecast would count every
 * reinvested ruble as buying more income than it does. Null when no value is known.
 */
function pricedYield(pricedIncomePerMonth: number, value: number): number | null {
  return value > 0 ? calcYieldPercent(pricedIncomePerMonth * 12, value) : null;
}

export function calculatePortfolioSnapshot(input: PortfolioCalculationInput): PortfolioSnapshot {
  const now = input.now ?? new Date();
  const quantityByAsset = new Map<number, number>();
  for (const holding of input.holdings) {
    quantityByAsset.set(
      holding.assetId,
      (quantityByAsset.get(holding.assetId) ?? 0) + holding.quantity,
    );
  }

  const historyByAsset = new Map<number, PaymentRecord[]>();
  for (const payment of input.paymentHistory) {
    if (payment.isForecast) continue;
    const arr = historyByAsset.get(payment.assetId) ?? [];
    arr.push({ amount: payment.amount, date: new Date(payment.date) });
    historyByAsset.set(payment.assetId, arr);
  }

  let totalValue = 0;
  let totalIncomePerMonth = 0;
  // Income of the assets with a known value: the yield divides this, not all income, by the value.
  let pricedIncomePerMonth = 0;
  const assetsById = new Map<number, CalculatedAssetStats>();
  const categoryMap = new Map<string, { value: number; incomePerMonth: number; pricedIncomePerMonth: number; count: number }>();
  const missingRates = new Set<string>();

  for (const asset of input.assets) {
    const assetId = asset.id;
    if (assetId == null) continue;

    const totalQuantity = quantityByAsset.get(assetId) ?? 0;
    const currency = asset.currency ?? 'RUB';
    const rateToRub = getRateToRub(currency, input.exchangeRates);
    const rateMissing = rateToRub <= 0;
    if (rateMissing && totalQuantity > 0) missingRates.add(normalizeCurrency(currency));
    const price = asset.currentPrice ?? 0;
    const nkd = asset.type === 'Облигации' ? (asset.accruedInterest ?? 0) : 0;
    const value = (price + nkd) * totalQuantity * rateToRub;

    const annualIncomePerUnit = calcAssetAnnualIncomePerUnit(
      asset,
      incomeSpreadOf(asset),
      historyByAsset.get(assetId) ?? [],
      now,
    ).annualIncome;
    const ndflRate = input.ndflRates.get(asset.type) ?? 0;
    const taxMultiplier = 1 - ndflRate / 100;
    const incomePerMonth = calcAssetIncomePerMonth(totalQuantity, annualIncomePerUnit) * taxMultiplier * rateToRub;
    const incomePerYear = incomePerMonth * 12;
    const yieldPercent = value > 0 ? calcYieldPercent(incomePerYear, value) : 0;

    const pricedIncome = value > 0 ? incomePerMonth : 0;
    totalValue += value;
    totalIncomePerMonth += incomePerMonth;
    pricedIncomePerMonth += pricedIncome;
    assetsById.set(assetId, {
      assetId,
      totalQuantity,
      annualIncomePerUnit,
      incomePerMonth,
      incomePerYear,
      value,
      yieldPercent,
      portfolioSharePercent: 0,
      currency,
      rateToRub,
      rateMissing,
    });

    const category = categoryMap.get(asset.type);
    if (category) {
      category.value += value;
      category.incomePerMonth += incomePerMonth;
      category.pricedIncomePerMonth += pricedIncome;
      category.count += 1;
    } else {
      categoryMap.set(asset.type, { value, incomePerMonth, pricedIncomePerMonth: pricedIncome, count: 1 });
    }
  }

  const totalIncomePerYear = totalIncomePerMonth * 12;
  const portfolio: PortfolioStats = {
    totalIncomePerMonth,
    totalIncomePerYear,
    totalValue,
    yieldPercent: pricedYield(pricedIncomePerMonth, totalValue),
  };

  for (const stats of assetsById.values()) {
    stats.portfolioSharePercent = totalValue > 0 ? (stats.value / totalValue) * 100 : 0;
  }

  const categories: CategoryStats[] = [];
  for (const [type, category] of categoryMap) {
    const categoryIncomePerYear = category.incomePerMonth * 12;
    categories.push({
      type,
      assetCount: category.count,
      totalIncomePerMonth: category.incomePerMonth,
      totalIncomePerYear: categoryIncomePerYear,
      totalValue: category.value,
      yieldPercent: pricedYield(category.pricedIncomePerMonth, category.value),
      portfolioSharePercent: totalValue > 0 ? (category.value / totalValue) * 100 : 0,
    });
  }
  categories.sort((a, b) => b.totalIncomePerMonth - a.totalIncomePerMonth);

  return { portfolio, categories, assetsById, missingRates: [...missingRates].sort() };
}
