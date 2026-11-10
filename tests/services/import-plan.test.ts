import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import { parseMDTable, type ImportAssetRow } from '@/services/import-parser';
import { planImport, groupRowsByAccount, SeveralAccountsError } from '@/services/import-plan';
import { applyImportPlan } from '@/services/import-applier';
import { computeImportDiff } from '@/services/import-diff';
import { applyImportDiff } from '@/services/import-applier';

const TABLE = `
| Счёт | Тикер | ISIN | Название | Тип | Кол-во | Ср.цена | Номинал | Валюта |
|------|-------|------|----------|-----|--------|---------|---------|--------|
| ИИС | SBER | RU0009029540 | Сбербанк | акция | 100 | 250 |  | RUB |
| ИИС |  | SU26222RMFS8 | ОФЗ 26222 | облигация | 10 | 98.5 | 1000 | RUB |
| Брокерский | SBER | RU0009029540 | Сбербанк | акция | 30 | 300 |  | RUB |
| Брокерский | GAZP | RU0007661625 | Газпром | акция | 50 | 150 |  | RUB |
`;

const applyPlan = async (plan: Awaited<ReturnType<typeof planImport>>) =>
  applyImportPlan(plan.map((a) => ({ diff: a.diff, accountName: a.name })), 'ai_import');

describe('groupRowsByAccount', () => {
  it('groups by account name, ignoring case and spaces, in table order', () => {
    const rows = [
      { name: 'a', type: 'Акции', quantity: 1, account: 'ИИС' },
      { name: 'b', type: 'Акции', quantity: 1, account: ' иис ' },
      { name: 'c', type: 'Акции', quantity: 1 },
    ] as ImportAssetRow[];
    expect(groupRowsByAccount(rows).map((g) => [g.name, g.rows.length])).toEqual([['ИИС', 2], [undefined, 1]]);
  });
});

describe('planImport + applyImportPlan', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('creates one account per «Счёт» and one asset per security', async () => {
    const plan = await planImport(parseMDTable(TABLE), { accountId: null, defaultName: 'Новый счёт' });
    expect(plan.map((a) => [a.name, a.accountId, a.diff.summary.added])).toEqual([['ИИС', null, 2], ['Брокерский', null, 2]]);

    const { accountIds, newAssetIds } = await applyPlan(plan);
    expect(accountIds).toHaveLength(2);
    expect((await db.accounts.toArray()).map((a) => a.name)).toEqual(['ИИС', 'Брокерский']);

    const assets = await db.assets.toArray();
    expect(assets).toHaveLength(3); // SBER shared by both accounts
    expect(newAssetIds).toHaveLength(3);

    const sber = assets.find((a) => a.ticker === 'SBER')!;
    const sberHoldings = await db.holdings.where('assetId').equals(sber.id!).toArray();
    expect(sberHoldings.map((h) => [h.accountId, h.quantity, h.averagePrice]).sort()).toEqual(
      [[accountIds[0], 100, 250], [accountIds[1], 30, 300]].sort(),
    );
    const ofz = assets.find((a) => a.isin === 'SU26222RMFS8')!;
    const [ofzHolding] = await db.holdings.where('assetId').equals(ofz.id!).toArray();
    expect(ofzHolding.averagePrice).toBe(985);
    expect(await db.importRecords.count()).toBe(2);
  });

  it('updates an existing account with the same name instead of creating a new one', async () => {
    await applyPlan(await planImport(parseMDTable(TABLE), { accountId: null, defaultName: 'Новый счёт' }));
    const iis = (await db.accounts.toArray()).find((a) => a.name === 'ИИС')!;

    const next = `| Счёт | Тикер | ISIN | Название | Кол-во |
|---|---|---|---|---|
| иис | SBER | RU0009029540 | Сбербанк | 120 |
| Новый ИИС | LKOH | RU0009024277 | Лукойл | 2 |`;
    const plan = await planImport(parseMDTable(next), { accountId: null, defaultName: 'Новый счёт' });
    expect(plan[0]).toMatchObject({ accountId: iis.id, name: 'ИИС' });
    expect(plan[0].diff.summary).toMatchObject({ changed: 1, removed: 1 }); // OFZ is not in the table
    expect(plan[1]).toMatchObject({ accountId: null, name: 'Новый ИИС' });
  });

  it('keeps a security moved between accounts in one import, with its payment history', async () => {
    const first = await computeImportDiff(
      [{ ticker: 'GAZP', isin: 'RU0007661625', name: 'Газпром', type: 'Акции', quantity: 50 }], null);
    await applyImportDiff(first, 'ai_import', 'Брокерский');
    const gazp = (await db.assets.toArray())[0];
    await db.paymentHistory.add({ assetId: gazp.id!, amount: 10, date: new Date('2026-07-01'), type: 'dividend', dataSource: 'moex' });

    // GAZP leaves «Брокерский» (only SBER stays) and moves to a new «ИИС»
    const moved = `| Счёт | Тикер | ISIN | Название | Кол-во |
|---|---|---|---|---|
| Брокерский | SBER | RU0009029540 | Сбербанк | 1 |
| ИИС | GAZP | RU0007661625 | Газпром | 50 |`;
    await applyPlan(await planImport(parseMDTable(moved), { accountId: null, defaultName: 'Новый счёт' }));

    const after = await db.assets.get(gazp.id!);
    expect(after).toBeDefined();
    expect(await db.paymentHistory.where('assetId').equals(gazp.id!).count()).toBe(1);
    const iis = (await db.accounts.toArray()).find((a) => a.name === 'ИИС')!;
    expect(await db.holdings.where('accountId').equals(iis.id!).count()).toBe(1);
  });

  it('rows without an account go to a new account even if one is called like the default', async () => {
    await applyImportDiff(await computeImportDiff([{ name: 'X', type: 'Прочее', quantity: 1 }], null), 'manual', 'Новый счёт');
    const plan = await planImport([{ ticker: 'SBER', name: 'Сбербанк', type: 'Акции', quantity: 1 }], { accountId: null, defaultName: 'Новый счёт' });
    expect(plan).toHaveLength(1);
    expect(plan[0].accountId).toBeNull();
  });

  it('import opened from one account refuses a table with several accounts', async () => {
    const accountId = await db.accounts.add({ name: 'ИИС', createdAt: new Date(), updatedAt: new Date() }) as number;
    await expect(planImport(parseMDTable(TABLE), { accountId, defaultName: '' })).rejects.toBeInstanceOf(SeveralAccountsError);

    const single = parseMDTable(TABLE).filter((r) => r.account === 'ИИС');
    const plan = await planImport(single, { accountId, defaultName: '' });
    expect(plan).toEqual([expect.objectContaining({ accountId, name: 'ИИС' })]);
  });
});
