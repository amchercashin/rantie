import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db/database';
import {
  parseMDTable,
  parseNumber,
  parseTypeLabel,
  prepareImportRows,
} from '@/services/import-parser';
import { computeImportDiff } from '@/services/import-diff';
import { applyImportDiff } from '@/services/import-applier';
import { normalizeCurrency } from '@/services/exchange-rates';

// The table the AI prompt in import-flow.tsx asks for
const AI_ANSWER = `
Счёт: ИИС Т-Банк

\`\`\`
| Тикер | ISIN | Название | Тип | Кол-во | Ср.цена | Номинал | Валюта |
|-------|------|----------|-----|--------|---------|---------|--------|
| SBER | RU0009029540 | Сбербанк | акция | 100 | 250.5 |  | RUB |
|  | RU000A0JXQ93 | ОФЗ 26222 | облигация | 10 | 98.5 | 1000 | RUB |
| **LQDT** | RU000A1014L8 | Ликвидность | фонд | 1500 | 1.62 | — | RUR |
\`\`\`
`;

describe('AI import table → data model', () => {
  it('parses the table the prompt asks for', () => {
    const rows = parseMDTable(AI_ANSWER);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ ticker: 'SBER', isin: 'RU0009029540', type: 'Акции', quantity: 100, averagePrice: 250.5 });
    expect(rows[0].faceValue).toBeUndefined();
    expect(rows[1]).toMatchObject({ ticker: undefined, type: 'Облигации', averagePrice: 98.5, faceValue: 1000 });
    expect(rows[2]).toMatchObject({ ticker: 'LQDT', type: 'Фонды' });
    expect(rows[2].faceValue).toBeUndefined();
  });

  it('takes the account from the heading above the table', () => {
    expect(parseMDTable(AI_ANSWER).every((r) => r.account === 'ИИС Т-Банк')).toBe(true);
  });

  it('reads every table, each with its own account', () => {
    const two = `${AI_ANSWER}\n### **Счёт — Брокерский**\n| Тикер | Название | Кол-во |\n|---|---|---|\n| GAZP | Газпром | 5 |\n\n| Тикер | Название | Кол-во |\n|---|---|---|\n| LKOH | Лукойл | 1 |`;
    const rows = parseMDTable(two);
    expect(rows.map((r) => [r.ticker, r.account])).toEqual([
      ['SBER', 'ИИС Т-Банк'], [undefined, 'ИИС Т-Банк'], ['LQDT', 'ИИС Т-Банк'],
      ['GAZP', 'Брокерский'],
      ['LKOH', undefined], // a heading belongs to one table only
    ]);
  });

  it('reads the «Счёт» column of one combined table', () => {
    const rows = parseMDTable(`| Счёт | Тикер | Название | Кол-во | Цена расчёта |
|---|---|---|---|---|
| ИИС | SBER | Сбербанк | 10 | 250 |
| Брокерский | SBER | Сбербанк | 5 | 260 |`);
    expect(rows.map((r) => [r.account, r.quantity, r.averagePrice])).toEqual([['ИИС', 10, 250], ['Брокерский', 5, 260]]);
  });

  it('parses numbers the way reports and AI write them', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1 234,56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1,234,567')).toBe(1234567);
    expect(parseNumber('98,5%')).toBe(98.5);
    expect(parseNumber('250 ₽')).toBe(250);
    expect(parseNumber('10 шт')).toBe(10);
    expect(parseNumber('—')).toBeUndefined();
    expect(parseNumber('0')).toBeUndefined();
  });

  it('maps long type labels', () => {
    expect(parseTypeLabel('Акция обыкновенная')).toBe('Акции');
    expect(parseTypeLabel('Облигация федерального займа')).toBe('Облигации');
    expect(parseTypeLabel('БПИФ рыночных финансовых инструментов')).toBe('Фонды');
    expect(parseTypeLabel('ЗПИФ')).toBe('Фонды');
    expect(parseTypeLabel('Фонды')).toBe('Фонды');
  });

  it('normalizes ruble aliases so the asset is not valued at zero', () => {
    expect(normalizeCurrency('RUR')).toBe('RUB');
    expect(normalizeCurrency('SUR')).toBe('RUB');
    expect(normalizeCurrency('руб.')).toBe('RUB');
    expect(normalizeCurrency('₽')).toBe('RUB');
    expect(normalizeCurrency('usd')).toBe('USD');
  });
});

describe('prepareImportRows', () => {
  it('converts bond price from % of face value to money per bond', () => {
    const [bond] = prepareImportRows([
      { isin: 'RU000A0JXQ93', name: 'ОФЗ', type: 'Облигации', quantity: 10, averagePrice: 98.5, faceValue: 1000 },
    ]);
    expect(bond.averagePrice).toBe(985);
    expect(bond.faceValue).toBe(1000);
  });

  it('drops a bond % price when the face value is unknown', () => {
    const [bond] = prepareImportRows([
      { isin: 'RU000A0JXQ93', name: 'ОФЗ', type: 'Облигации', quantity: 10, averagePrice: 98.5 },
    ]);
    expect(bond.averagePrice).toBeUndefined();
  });

  it('leaves stock prices as they are', () => {
    const [stock] = prepareImportRows([{ ticker: 'SBER', name: 'Сбер', type: 'Акции', quantity: 1, averagePrice: 250 }]);
    expect(stock.averagePrice).toBe(250);
  });

  it('merges the same security listed twice', () => {
    const rows = prepareImportRows([
      { ticker: 'SBER', isin: 'RU0009029540', name: 'Сбербанк', type: 'Акции', quantity: 100, averagePrice: 200 },
      { isin: 'ru0009029540', name: 'Сбербанк ао', type: 'Акции', quantity: 300, averagePrice: 300 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ticker: 'SBER', quantity: 400, averagePrice: 275 });
  });
});

describe('AI import end to end', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('stores prices per unit in the asset currency and one asset per security', async () => {
    const rows = parseMDTable(AI_ANSWER);
    rows.push({ ...rows[0], quantity: 50, averagePrice: 280.5 }); // same SBER again
    const diff = await computeImportDiff(rows, null);
    expect(diff.summary.added).toBe(3);

    const { accountId } = await applyImportDiff(diff, 'ai_import', 'ИИС Т-Банк');
    const assets = await db.assets.toArray();
    expect(assets).toHaveLength(3);

    const holdings = await db.holdings.where('accountId').equals(accountId).toArray();
    const byIsin = (isin: string) => {
      const asset = assets.find((a) => a.isin === isin)!;
      return { asset, holding: holdings.find((h) => h.assetId === asset.id)! };
    };

    const sber = byIsin('RU0009029540');
    expect(sber.holding.quantity).toBe(150);
    expect(sber.holding.averagePrice).toBe(260.5);

    const ofz = byIsin('RU000A0JXQ93');
    expect(ofz.asset.type).toBe('Облигации');
    expect(ofz.asset.faceValue).toBe(1000);
    expect(ofz.asset.currentPrice).toBe(985);
    expect(ofz.holding.averagePrice).toBe(985);

    expect(byIsin('RU000A1014L8').asset.currency).toBe('RUB');
  });
});
