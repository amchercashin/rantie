export type DataSource = 'moex' | 'dohod' | 'parus' | 'import' | 'manual';

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
  yieldPercent: number;
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
