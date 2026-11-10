import { db } from '@/db/database';
import type { Account, Holding } from '@/models/account';
import type { Asset, ExchangeRate, ImportRecord, PaymentHistory } from '@/models/types';
import { normalizeAssetDefaults } from './asset-factory';
import { normalizeCurrency } from './exchange-rates';

interface BackupPayload {
  version: number;
  accounts: Account[];
  assets: Asset[];
  holdings: Holding[];
  paymentHistory: PaymentHistory[];
  importRecords: ImportRecord[];
  settings: { key: string; value: string }[];
  exchangeRates: ExchangeRate[];
}

export async function exportAllData(): Promise<string> {
  const data = {
    version: 4,
    exportedAt: new Date().toISOString(),
    accounts: await db.accounts.toArray(),
    assets: await db.assets.toArray(),
    holdings: await db.holdings.toArray(),
    paymentHistory: await db.paymentHistory.toArray(),
    importRecords: await db.importRecords.toArray(),
    settings: await db.table('settings').toArray(),
    exchangeRates: await db.exchangeRates.toArray(),
  };
  return JSON.stringify(data, null, 2);
}

export async function importAllData(json: string): Promise<void> {
  const data = parseBackup(json);
  const settingsTable = db.table('settings');

  await db.transaction('rw', [db.accounts, db.assets, db.holdings, db.paymentHistory, db.importRecords, db.exchangeRates, settingsTable], async () => {
    await db.accounts.clear();
    await db.assets.clear();
    await db.holdings.clear();
    await db.paymentHistory.clear();
    await db.importRecords.clear();
    await db.exchangeRates.clear();
    await settingsTable.clear();

    if (data.accounts.length) await db.accounts.bulkAdd(data.accounts);
    if (data.assets.length) await db.assets.bulkAdd(data.assets);
    if (data.holdings.length) await db.holdings.bulkAdd(data.holdings);
    if (data.paymentHistory.length) await db.paymentHistory.bulkAdd(data.paymentHistory);
    if (data.importRecords.length) await db.importRecords.bulkAdd(data.importRecords);
    if (data.exchangeRates.length) await db.exchangeRates.bulkAdd(data.exchangeRates);
    for (const setting of data.settings) await settingsTable.put(setting);
  });
}

function parseBackup(json: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Невалидный формат: некорректный JSON');
  }

  const data = asRecord(raw, 'Невалидный формат данных');
  if (
    typeof data.version !== 'number' ||
    data.version < 3 ||
    !Array.isArray(data.accounts) ||
    !Array.isArray(data.assets) ||
    !Array.isArray(data.holdings)
  ) {
    throw new Error('Невалидный формат: требуется версия 3 с accounts, assets и holdings');
  }

  const accounts = data.accounts.map((row, i) => parseAccount(row, i));
  const assets = data.assets.map((row, i) => parseAsset(row, i));
  const holdings = arrayOrEmpty(data.holdings).map((row, i) => parseHolding(row, i));
  const paymentHistory = arrayOrEmpty(data.paymentHistory).map((row, i) => parsePayment(row, i));
  const importRecords = arrayOrEmpty(data.importRecords).map((row, i) => parseImportRecord(row, i));
  const settings = arrayOrEmpty(data.settings).map((row, i) => parseSetting(row, i));
  const exchangeRates = arrayOrEmpty(data.exchangeRates).map((row, i) => parseExchangeRate(row, i));

  validateRelations(accounts, assets, holdings, paymentHistory);

  return {
    version: data.version,
    accounts,
    assets,
    holdings,
    paymentHistory,
    importRecords,
    settings,
    exchangeRates,
  };
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseOptionalId(value: unknown, label: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}: id должен быть числом`);
  return value;
}

function parseNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}: требуется число`);
  return value;
}

function parseString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}: требуется строка`);
  return value;
}

function parseDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  if (!Number.isFinite(date.getTime())) throw new Error(`${label}: некорректная дата`);
  return date;
}

function parseAccount(value: unknown, index: number): Account {
  const row = asRecord(value, `accounts[${index}]: объект обязателен`);
  return {
    id: parseOptionalId(row.id, `accounts[${index}]`),
    name: parseString(row.name, `accounts[${index}].name`),
    createdAt: parseDate(row.createdAt, `accounts[${index}].createdAt`),
    updatedAt: parseDate(row.updatedAt, `accounts[${index}].updatedAt`),
  };
}

function parseAsset(value: unknown, index: number): Asset {
  const row = asRecord(value, `assets[${index}]: объект обязателен`);
  return normalizeAssetDefaults({
    ...row,
    id: parseOptionalId(row.id, `assets[${index}]`),
    type: parseString(row.type, `assets[${index}].type`),
    name: parseString(row.name, `assets[${index}].name`),
    dataSource: parseString(row.dataSource, `assets[${index}].dataSource`) as Asset['dataSource'],
    paymentPerUnitSource: parseString(row.paymentPerUnitSource, `assets[${index}].paymentPerUnitSource`) as Asset['paymentPerUnitSource'],
    frequencyPerYear: parseNumber(row.frequencyPerYear, `assets[${index}].frequencyPerYear`),
    createdAt: parseDate(row.createdAt, `assets[${index}].createdAt`),
    updatedAt: parseDate(row.updatedAt, `assets[${index}].updatedAt`),
    nextExpectedDate: row.nextExpectedDate ? parseDate(row.nextExpectedDate, `assets[${index}].nextExpectedDate`) : undefined,
    nextExpectedCutoffDate: row.nextExpectedCutoffDate ? parseDate(row.nextExpectedCutoffDate, `assets[${index}].nextExpectedCutoffDate`) : undefined,
    nextExpectedCreditDate: row.nextExpectedCreditDate ? parseDate(row.nextExpectedCreditDate, `assets[${index}].nextExpectedCreditDate`) : undefined,
  }) as Asset;
}

function parseHolding(value: unknown, index: number): Holding {
  const row = asRecord(value, `holdings[${index}]: объект обязателен`);
  return {
    id: parseOptionalId(row.id, `holdings[${index}]`),
    accountId: parseNumber(row.accountId, `holdings[${index}].accountId`),
    assetId: parseNumber(row.assetId, `holdings[${index}].assetId`),
    quantity: parseNumber(row.quantity, `holdings[${index}].quantity`),
    quantitySource: parseString(row.quantitySource, `holdings[${index}].quantitySource`) as Holding['quantitySource'],
    importedQuantity: typeof row.importedQuantity === 'number' ? row.importedQuantity : undefined,
    averagePrice: typeof row.averagePrice === 'number' ? row.averagePrice : undefined,
    createdAt: parseDate(row.createdAt, `holdings[${index}].createdAt`),
    updatedAt: parseDate(row.updatedAt, `holdings[${index}].updatedAt`),
  };
}

function parsePayment(value: unknown, index: number): PaymentHistory {
  const row = asRecord(value, `paymentHistory[${index}]: объект обязателен`);
  return {
    id: parseOptionalId(row.id, `paymentHistory[${index}]`),
    assetId: parseNumber(row.assetId, `paymentHistory[${index}].assetId`),
    amount: parseNumber(row.amount, `paymentHistory[${index}].amount`),
    date: parseDate(row.date, `paymentHistory[${index}].date`),
    type: parseString(row.type, `paymentHistory[${index}].type`) as PaymentHistory['type'],
    dataSource: parseString(row.dataSource, `paymentHistory[${index}].dataSource`) as PaymentHistory['dataSource'],
    isForecast: row.isForecast === true ? true : undefined,
  };
}

function parseImportRecord(value: unknown, index: number): ImportRecord {
  const row = asRecord(value, `importRecords[${index}]: объект обязателен`);
  return {
    id: parseOptionalId(row.id, `importRecords[${index}]`),
    date: parseDate(row.date, `importRecords[${index}].date`),
    source: parseString(row.source, `importRecords[${index}].source`) as ImportRecord['source'],
    itemsChanged: parseNumber(row.itemsChanged, `importRecords[${index}].itemsChanged`),
    itemsAdded: parseNumber(row.itemsAdded, `importRecords[${index}].itemsAdded`),
    itemsUnchanged: parseNumber(row.itemsUnchanged, `importRecords[${index}].itemsUnchanged`),
    itemsRemoved: parseNumber(row.itemsRemoved, `importRecords[${index}].itemsRemoved`),
    accountId: parseNumber(row.accountId, `importRecords[${index}].accountId`),
  };
}

function parseSetting(value: unknown, index: number): { key: string; value: string } {
  const row = asRecord(value, `settings[${index}]: объект обязателен`);
  return {
    key: parseString(row.key, `settings[${index}].key`),
    value: typeof row.value === 'string' ? row.value : String(row.value ?? ''),
  };
}

function parseExchangeRate(value: unknown, index: number): ExchangeRate {
  const row = asRecord(value, `exchangeRates[${index}]: объект обязателен`);
  return {
    currency: normalizeCurrency(parseString(row.currency, `exchangeRates[${index}].currency`)),
    rateToRub: parseNumber(row.rateToRub, `exchangeRates[${index}].rateToRub`),
    updatedAt: parseDate(row.updatedAt, `exchangeRates[${index}].updatedAt`),
    source: row.source === 'moex' ? 'moex' : 'manual',
  };
}

function validateRelations(
  accounts: Account[],
  assets: Asset[],
  holdings: Holding[],
  paymentHistory: PaymentHistory[],
): void {
  const accountIds = new Set(accounts.map((account) => account.id).filter((id): id is number => id != null));
  const assetIds = new Set(assets.map((asset) => asset.id).filter((id): id is number => id != null));

  for (const holding of holdings) {
    if (!accountIds.has(holding.accountId)) throw new Error(`holdings: неизвестный accountId ${holding.accountId}`);
    if (!assetIds.has(holding.assetId)) throw new Error(`holdings: неизвестный assetId ${holding.assetId}`);
  }

  for (const payment of paymentHistory) {
    if (!assetIds.has(payment.assetId)) throw new Error(`paymentHistory: неизвестный assetId ${payment.assetId}`);
  }
}
