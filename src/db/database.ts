import Dexie, { type EntityTable } from 'dexie';
import type { AppSetting, Asset, PaymentHistory, ImportRecord, ExchangeRate } from '@/models/types';
import type { Account, Holding } from '@/models/account';

const FREQUENCY_DEFAULTS: Record<string, number> = {
  'Акции': 1, 'Облигации': 2, 'Фонды': 12,
  'Недвижимость': 12, 'Вклады': 12, 'Крипта': 12,
  'Валюта': 0, 'Прочее': 0,
  // Keep old enum keys for v4 upgrade function
  stock: 1, bond: 2, fund: 12, realestate: 12, deposit: 12, other: 12,
};

class HeroIncomeDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>;
  assets!: EntityTable<Asset, 'id'>;
  holdings!: EntityTable<Holding, 'id'>;
  paymentHistory!: EntityTable<PaymentHistory, 'id'>;
  importRecords!: EntityTable<ImportRecord, 'id'>;
  exchangeRates!: EntityTable<ExchangeRate, 'currency'>;
  settings!: EntityTable<AppSetting, 'key'>;

  constructor() {
    super('HeroIncomeDB');
    this.version(1).stores({
      assets: '++id, type, ticker',
      paymentSchedules: '++id, assetId',
      paymentHistory: '++id, assetId, date',
      importRecords: '++id, date',
      settings: 'key',
    });
    this.version(2).stores({
      assets: '++id, type, ticker, isin',
    });
    this.version(3).stores({
      assets: '++id, type, ticker, isin',
      paymentSchedules: '++id, assetId',
      paymentHistory: '++id, [assetId+date]',
      importRecords: '++id, date',
      settings: 'key',
    });
    this.version(4)
      .stores({
        assets: '++id, type, ticker, isin',
        paymentSchedules: null,
        paymentHistory: '++id, [assetId+date]',
        importRecords: '++id, date',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        const schedules = await tx.table('paymentSchedules').toArray();
        const scheduleByAssetId = new Map<number, Record<string, unknown>>();
        for (const s of schedules) {
          scheduleByAssetId.set(s.assetId, s);
        }

        await tx.table('assets').toCollection().modify((asset: Record<string, unknown>) => {
          const schedule = scheduleByAssetId.get(asset.id as number);

          if (schedule) {
            asset.frequencyPerYear = schedule.frequencyPerYear;
            const isFromMoex = schedule.dataSource === 'moex';
            asset.frequencySource = isFromMoex ? 'moex' : 'manual';
            asset.moexFrequency = isFromMoex ? schedule.frequencyPerYear : undefined;

            asset.nextExpectedDate = schedule.nextExpectedDate;
            asset.nextExpectedCutoffDate = schedule.nextExpectedCutoffDate;
            asset.nextExpectedCreditDate = schedule.nextExpectedCreditDate;

            const wasManualForecast =
              schedule.activeMetric === 'forecast' &&
              schedule.forecastMethod === 'manual' &&
              schedule.forecastAmount != null;
            asset.paymentPerUnitSource = wasManualForecast ? 'manual' : 'fact';
            asset.paymentPerUnit = wasManualForecast ? schedule.forecastAmount : undefined;
          } else {
            const type = asset.type as string;
            asset.frequencyPerYear = FREQUENCY_DEFAULTS[type] ?? 12;
            asset.frequencySource = 'manual';
            asset.paymentPerUnitSource = 'fact';
          }

          const ds = asset.dataSource as string;
          asset.quantitySource = ds === 'import' ? 'import' : 'manual';
          asset.importedQuantity = ds === 'import' ? asset.quantity : undefined;
        });
      });
    this.version(5)
      .stores({
        accounts: '++id',
        assets: '++id, type, ticker, isin',
        holdings: '++id, accountId, assetId, &[accountId+assetId]',
        paymentHistory: '++id, [assetId+date]',
        importRecords: '++id, date',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('assets').clear();
        await tx.table('paymentHistory').clear();
        await tx.table('importRecords').clear();
      });
    this.version(6)
      .stores({
        accounts: '++id',
        assets: '++id, type, ticker, isin',
        holdings: '++id, accountId, assetId, &[accountId+assetId]',
        paymentHistory: '++id, [assetId+date]',
        importRecords: '++id, date',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        // paymentPerUnit semantics change: per-payment → annual
        // Multiply manual values by frequencyPerYear
        await tx.table('assets').toCollection().modify((asset: Record<string, unknown>) => {
          if (
            asset.paymentPerUnitSource === 'manual' &&
            asset.paymentPerUnit != null &&
            typeof asset.frequencyPerYear === 'number' &&
            asset.frequencyPerYear > 0
          ) {
            asset.paymentPerUnit = (asset.paymentPerUnit as number) * (asset.frequencyPerYear as number);
          }
        });
      });
    this.version(7)
      .stores({
        accounts: '++id',
        assets: '++id, type, ticker, isin',
        holdings: '++id, accountId, assetId, &[accountId+assetId]',
        paymentHistory: '++id, [assetId+date]',
        importRecords: '++id, date',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        // Fund distributions from heroincome-data come from Parus, not dohod.ru.
        // Rebrand dataSource for existing records: distribution + dohod → parus.
        await tx.table('paymentHistory').toCollection().modify((p: Record<string, unknown>) => {
          if (p.type === 'distribution' && p.dataSource === 'dohod') {
            p.dataSource = 'parus';
          }
        });
      });
    this.version(8)
      .stores({
        accounts: '++id',
        assets: '++id, type, ticker, isin',
        holdings: '++id, accountId, assetId, &[accountId+assetId]',
        paymentHistory: '++id, [assetId+date]',
        importRecords: '++id, date',
        exchangeRates: 'currency',
        settings: 'key',
      })
      .upgrade(async (tx) => {
        await tx.table('assets').toCollection().modify((asset: Record<string, unknown>) => {
          if (!asset.currency) asset.currency = 'RUB';
          if (!asset.frequencySource) asset.frequencySource = 'manual';
        });
      });
  }
}

export const db = new HeroIncomeDB();
