export type DataSource = 'moex' | 'dohod' | 'parus' | 'import' | 'manual';

/** A row of the key–value `settings` table: tax rates, the income goal, sync timestamps, the demo account. */
export interface AppSetting {
  key: string;
  value: string;
}

export interface ExchangeRate {
  currency: string;
  rateToRub: number;
  updatedAt: Date;
  /** 'moex' — loaded automatically and refreshed on sync; 'manual' — typed by the user, never overwritten. */
  source: 'moex' | 'manual';
}

export interface Asset {
  id?: number;
  type: string;
  ticker?: string;
  isin?: string;
  moexSecid?: string;
  moexBoardId?: string;
  moexMarket?: 'shares' | 'bonds';
  name: string;
  currency?: string;
  emitter?: string;
  securityCategory?: string;
  issueInfo?: string;
  dataSource: DataSource;
  createdAt: Date;
  updatedAt: Date;
  currentPrice?: number;
  faceValue?: number;
  accruedInterest?: number;

  // payment per unit with source tracking
  paymentPerUnit?: number;
  paymentPerUnitSource: 'fact' | 'manual';

  // frequency with source tracking
  frequencyPerYear: number;
  frequencySource: 'moex' | 'manual';
  moexFrequency?: number;

  // transferred from PaymentSchedule
  nextExpectedDate?: Date;
  nextExpectedCutoffDate?: Date;
  nextExpectedCreditDate?: Date;
}

// PaymentSchedule — DELETED (merged into Asset)

export interface PaymentHistory {
  id?: number;
  assetId: number;
  amount: number;
  date: Date;
  type: 'dividend' | 'coupon' | 'rent' | 'interest' | 'distribution' | 'other';
  dataSource: DataSource;
  isForecast?: boolean;
}

export interface ImportRecord {
  id?: number;
  date: Date;
  source: 'sber_xls' | 'sber_html' | 'csv' | 'markdown' | 'ai_import' | 'manual';
  itemsChanged: number;
  itemsAdded: number;
  itemsUnchanged: number;
  itemsRemoved: number;
  accountId: number;
}

export interface PortfolioStats {
  totalIncomePerMonth: number;
  totalIncomePerYear: number;
  totalValue: number;
  /**
   * Income of the assets with a known value ÷ that value, %. An asset with income but no price
   * (crypto, a flat whose price was never entered) adds to the income, not to the yield.
   * Null when no asset in view has a value.
   */
  yieldPercent: number | null;
}

export interface CategoryStats extends PortfolioStats {
  type: string;
  assetCount: number;
  portfolioSharePercent: number;
}

export interface AssetStats {
  incomePerMonth: number;
  incomePerYear: number;
  value: number;
  yieldPercent: number;
  portfolioSharePercent: number;
}
