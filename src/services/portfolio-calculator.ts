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
  /** Share of the gross income left after NDFL: 1 − rate/100, averaged by quantity over the accounts holding the asset. */
  taxMultiplier: number;
  /** A rate > 0 applies to some of the position. */
  taxed: boolean;
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
  /** accountId → NDFL rate, % (see getNdflRates). An account missing here is untaxed. */
  ndflRates: Map<number, number>;
  exchangeRates: Map<string, number>;
  now?: Date;
}

/**
 * How much of an asset's gross income is left after NDFL. Each holding is taxed at its account's
 * rate and the result is averaged by quantity, so 400 shares on a broker account at 13% and 100
 * on an ИИС at 0% keep 0.896.
 */
export function assetTaxShare(
  holdings: Pick<Holding, 'accountId' | 'quantity'>[],
  ndflRates: Map<number, number>,
): { taxMultiplier: number; taxed: boolean } {
  let quantity = 0;
  let netQuantity = 0;
  let taxed = false;
  for (const h of holdings) {
    if (h.quantity === 0) continue;
    const rate = ndflRates.get(h.accountId) ?? 0;
    quantity += h.quantity;
    netQuantity += h.quantity * (1 - rate / 100);
    if (rate > 0) taxed = true;
  }
  return { taxMultiplier: quantity === 0 ? 1 : netQuantity / quantity, taxed };
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
  const holdingsByAsset = new Map<number, Holding[]>();
  for (const holding of input.holdings) {
    quantityByAsset.set(
      holding.assetId,
      (quantityByAsset.get(holding.assetId) ?? 0) + holding.quantity,
    );
    const arr = holdingsByAsset.get(holding.assetId) ?? [];
    arr.push(holding);
    holdingsByAsset.set(holding.assetId, arr);
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
  const categoryMap = new Map<string, { value: number; incomePerMonth: number; pricedIncomePerMonth: number; count: number; taxed: boolean }>();
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
    const { taxMultiplier, taxed } = assetTaxShare(holdingsByAsset.get(assetId) ?? [], input.ndflRates);
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
      taxMultiplier,
      taxed,
    });

    const category = categoryMap.get(asset.type);
    if (category) {
      category.value += value;
      category.incomePerMonth += incomePerMonth;
      category.pricedIncomePerMonth += pricedIncome;
      category.count += 1;
      category.taxed ||= taxed;
    } else {
      categoryMap.set(asset.type, { value, incomePerMonth, pricedIncomePerMonth: pricedIncome, count: 1, taxed });
    }
  }

  const totalIncomePerYear = totalIncomePerMonth * 12;
  const portfolio: PortfolioStats = {
    totalIncomePerMonth,
    totalIncomePerYear,
    totalValue,
    yieldPercent: pricedYield(pricedIncomePerMonth, totalValue),
    taxed: [...categoryMap.values()].some((c) => c.taxed),
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
      taxed: category.taxed,
    });
  }
  categories.sort((a, b) => b.totalIncomePerMonth - a.totalIncomePerMonth);

  return { portfolio, categories, assetsById, missingRates: [...missingRates].sort() };
}
