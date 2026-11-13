import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { exportAllData, importAllData } from '@/services/backup';

describe('backup v3', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('exports version 4 with accounts, holdings, and exchange rates', async () => {
    await db.accounts.add({ name: 'Test', createdAt: new Date(), updatedAt: new Date() });
    await db.exchangeRates.put({ currency: 'USD', rateToRub: 90, updatedAt: new Date(), source: 'manual' });
    const json = await exportAllData();
    const data = JSON.parse(json);
    expect(data.version).toBe(4);
    expect(data.accounts).toHaveLength(1);
    expect(data.holdings).toBeDefined();
    expect(data.exchangeRates).toHaveLength(1);
  });

  it('turns the per-category NDFL rates of an old backup into account rates', async () => {
    const now = new Date().toISOString();
    await importAllData(JSON.stringify({
      version: 4,
      accounts: [{ id: 1, name: 'ИИС', createdAt: now, updatedAt: now }, { id: 2, name: 'Брокер', createdAt: now, updatedAt: now }],
      assets: [
        { id: 1, type: 'Облигации', name: 'ОФЗ', dataSource: 'manual', paymentPerUnitSource: 'fact', frequencyPerYear: 2, frequencySource: 'manual', createdAt: now, updatedAt: now },
        { id: 2, type: 'Акции', name: 'Сбер', dataSource: 'manual', paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'manual', createdAt: now, updatedAt: now },
      ],
      holdings: [
        { id: 1, accountId: 1, assetId: 1, quantity: 10, quantitySource: 'manual', createdAt: now, updatedAt: now },
        { id: 2, accountId: 2, assetId: 2, quantity: 10, quantitySource: 'manual', createdAt: now, updatedAt: now },
      ],
      paymentHistory: [],
      importRecords: [],
      settings: [{ key: 'ndfl-Облигации', value: '0' }, { key: 'ndfl-Акции', value: '15' }, { key: 'theme', value: 'x' }],
    }));
    const settings = await db.settings.toArray();
    expect(settings).toEqual(expect.arrayContaining([
      { key: 'ndfl@1', value: '0' },
      { key: 'ndfl@2', value: '15' },
      { key: 'theme', value: 'x' },
      { key: 'ndfl@migrated', value: '1' },
    ]));
    // Kept, so the previous app version still finds them after a rollback.
    expect(settings).toContainEqual({ key: 'ndfl-Акции', value: '15' });
  });

  it('leaves the NDFL rates of a backup made after the move as they are', async () => {
    const now = new Date().toISOString();
    await importAllData(JSON.stringify({
      version: 4,
      accounts: [{ id: 1, name: 'ИИС', createdAt: now, updatedAt: now }],
      assets: [{ id: 1, type: 'Акции', name: 'Сбер', dataSource: 'manual', paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'manual', createdAt: now, updatedAt: now }],
      holdings: [{ id: 1, accountId: 1, assetId: 1, quantity: 10, quantitySource: 'manual', createdAt: now, updatedAt: now }],
      paymentHistory: [],
      importRecords: [],
      settings: [{ key: 'ndfl-Акции', value: '0' }, { key: 'ndfl@migrated', value: '1' }],
    }));
    expect((await db.settings.toArray()).map((r) => r.key).sort()).toEqual(['ndfl-Акции', 'ndfl@migrated']);
  });

  it('imports v3 format with accounts and holdings', async () => {
    const now = new Date().toISOString();
    const json = JSON.stringify({
      version: 3,
      accounts: [{ id: 1, name: 'Сбер', createdAt: now, updatedAt: now }],
      assets: [{ id: 1, type: 'Акции', name: 'SBER', dataSource: 'import', paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'manual', createdAt: now, updatedAt: now }],
      holdings: [{ id: 1, accountId: 1, assetId: 1, quantity: 100, quantitySource: 'import', createdAt: now, updatedAt: now }],
      paymentHistory: [],
      importRecords: [],
      settings: [],
    });
    await importAllData(json);
    const accounts = await db.accounts.toArray();
    const holdings = await db.holdings.toArray();
    expect(accounts).toHaveLength(1);
    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(100);
  });

  it('rejects old v2 format without accounts', async () => {
    const json = JSON.stringify({
      version: 2,
      assets: [{ id: 1, type: 'stock', name: 'SBER' }],
      paymentHistory: [],
    });
    await expect(importAllData(json)).rejects.toThrow('не файл бэкапа');
  });

  it('rejects invalid JSON', async () => {
    await expect(importAllData('not json')).rejects.toThrow('не файл бэкапа');
  });

  it('exports empty database', async () => {
    const json = await exportAllData();
    const data = JSON.parse(json);
    expect(data.version).toBe(4);
    expect(data.accounts).toHaveLength(0);
    expect(data.assets).toHaveLength(0);
    expect(data.holdings).toHaveLength(0);
  });

  it('rehydrates Date fields from ISO strings on import', async () => {
    const now = new Date();
    await db.accounts.add({ name: 'Сбер', createdAt: now, updatedAt: now });
    await db.assets.add({
      type: 'Акции', ticker: 'SBER', name: 'Сбербанк',
      paymentPerUnitSource: 'fact', frequencyPerYear: 1, frequencySource: 'manual',
      dataSource: 'manual', createdAt: now, updatedAt: now,
    });
    await db.holdings.add({
      accountId: 1, assetId: 1, quantity: 100,
      quantitySource: 'import', createdAt: now, updatedAt: now,
    });
    await db.paymentHistory.add({
      assetId: 1, amount: 34.84, date: new Date('2025-07-18'),
      type: 'dividend', dataSource: 'moex',
    });

    const json = await exportAllData();
    await importAllData(json);

    const accounts = await db.accounts.toArray();
    expect(accounts[0].createdAt).toBeInstanceOf(Date);

    const holdings = await db.holdings.toArray();
    expect(holdings[0].createdAt).toBeInstanceOf(Date);

    const history = await db.paymentHistory.toArray();
    expect(history[0].date).toBeInstanceOf(Date);
    expect(history[0].date.getTime()).toBe(new Date('2025-07-18').getTime());

    const assets = await db.assets.toArray();
    expect(assets[0].createdAt).toBeInstanceOf(Date);
  });

  it('keeps the board recommendation of a forecast', async () => {
    const now = new Date();
    await db.accounts.add({ name: 'Сбер', createdAt: now, updatedAt: now });
    await db.assets.add({
      type: 'Акции', ticker: 'LKOH', name: 'Лукойл',
      paymentPerUnitSource: 'fact', frequencyPerYear: 2, frequencySource: 'moex',
      dataSource: 'moex', createdAt: now, updatedAt: now,
    });
    await db.holdings.add({ accountId: 1, assetId: 1, quantity: 1, quantitySource: 'import', createdAt: now, updatedAt: now });
    await db.paymentHistory.bulkAdd([
      { assetId: 1, amount: 535, date: new Date('2026-12-09'), type: 'dividend', dataSource: 'dohod', isForecast: true, recommended: true },
      { assetId: 1, amount: 550, date: new Date('2027-05-04'), type: 'dividend', dataSource: 'smartlab', isForecast: true },
    ]);

    await importAllData(await exportAllData());

    const history = (await db.paymentHistory.toArray()).sort((a, b) => a.amount - b.amount);
    expect(history.map((p) => [p.dataSource, p.isForecast, p.recommended])).toEqual([
      ['dohod', true, true],
      ['smartlab', true, undefined],
    ]);
  });

  it('import clears existing data before restoring', async () => {
    const now = new Date();
    await db.accounts.add({ name: 'Old', createdAt: now, updatedAt: now });
    await db.assets.add({
      type: 'Акции', name: 'Old',
      paymentPerUnitSource: 'fact',
      frequencyPerYear: 1, frequencySource: 'manual',
      dataSource: 'manual', createdAt: now, updatedAt: now,
    });

    const json = JSON.stringify({
      version: 3,
      accounts: [],
      assets: [],
      holdings: [],
      paymentHistory: [],
      importRecords: [],
      settings: [],
    });
    await importAllData(json);
    expect(await db.accounts.count()).toBe(0);
    expect(await db.assets.count()).toBe(0);
    expect(await db.holdings.count()).toBe(0);
  });

  it('preserves existing data when import validation fails', async () => {
    const now = new Date();
    await db.accounts.add({ name: 'Keep Me', createdAt: now, updatedAt: now });

    await expect(importAllData('not json')).rejects.toThrow();
    expect(await db.accounts.count()).toBe(1);
    const kept = (await db.accounts.toArray())[0];
    expect(kept.name).toBe('Keep Me');
  });

  it('rejects JSON without required arrays', async () => {
    await expect(importAllData(JSON.stringify({ foo: 'bar' }))).rejects.toThrow('не файл бэкапа');
  });

  it('rejects holdings that reference missing assets without clearing current data', async () => {
    const now = new Date().toISOString();
    await db.accounts.add({ name: 'Keep Me', createdAt: new Date(), updatedAt: new Date() });

    const json = JSON.stringify({
      version: 3,
      accounts: [{ id: 1, name: 'Сбер', createdAt: now, updatedAt: now }],
      assets: [],
      holdings: [{ id: 1, accountId: 1, assetId: 999, quantity: 100, quantitySource: 'import', createdAt: now, updatedAt: now }],
      paymentHistory: [],
      importRecords: [],
      settings: [],
    });

    await expect(importAllData(json)).rejects.toThrow('assetId');
    expect(await db.accounts.count()).toBe(1);
    expect((await db.accounts.toArray())[0].name).toBe('Keep Me');
  });

  it('imports exchange rates when present', async () => {
    const json = JSON.stringify({
      version: 4,
      accounts: [],
      assets: [],
      holdings: [],
      paymentHistory: [],
      importRecords: [],
      settings: [],
      exchangeRates: [{ currency: 'USD', rateToRub: 90, updatedAt: new Date().toISOString(), source: 'manual' }],
    });

    await importAllData(json);

    expect(await db.exchangeRates.get('USD')).toMatchObject({
      currency: 'USD',
      rateToRub: 90,
      source: 'manual',
    });
  });

  it('keeps where an exchange rate came from', async () => {
    const json = JSON.stringify({
      version: 4,
      accounts: [],
      assets: [],
      holdings: [],
      paymentHistory: [],
      importRecords: [],
      settings: [],
      exchangeRates: [
        { currency: 'USD', rateToRub: 82.5, updatedAt: new Date().toISOString(), source: 'moex' },
        { currency: 'EUR', rateToRub: 95, updatedAt: new Date().toISOString() },
      ],
    });

    await importAllData(json);

    expect(await db.exchangeRates.get('USD')).toMatchObject({ source: 'moex' });
    expect(await db.exchangeRates.get('EUR')).toMatchObject({ source: 'manual' });
  });
});
