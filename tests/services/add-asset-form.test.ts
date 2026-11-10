import { describe, expect, it } from 'vitest';
import { addAssetKindOf, buildAssetFromForm, type AddAssetForm } from '@/services/add-asset-form';

const base: AddAssetForm = { type: 'Акции', name: '', ticker: '', currency: 'RUB', quantity: 0 };

describe('addAssetKindOf', () => {
  it('maps categories to form layouts', () => {
    expect(addAssetKindOf('Облигации')).toBe('security');
    expect(addAssetKindOf('Вклады')).toBe('deposit');
    expect(addAssetKindOf('Недвижимость')).toBe('realty');
    expect(addAssetKindOf('Золото')).toBe('other');
  });
});

describe('buildAssetFromForm', () => {
  it('securities: normalizes ticker, derives average price, names after ticker', () => {
    const r = buildAssetFromForm({ ...base, ticker: ' sber ', quantity: 100, totalCost: 25000 });
    expect(r.asset).toMatchObject({ ticker: 'SBER', name: 'SBER', currentPrice: 250, paymentPerUnitSource: 'fact' });
    expect(r.quantity).toBe(100);
    expect(r.averagePrice).toBe(250);
  });

  it('deposits: income = amount × rate, paid monthly', () => {
    const r = buildAssetFromForm({ ...base, type: 'Вклады', name: 'Вклад', value: 500_000, ratePercent: 18 });
    expect(r.asset).toMatchObject({ currentPrice: 500_000, paymentPerUnit: 90_000, paymentPerUnitSource: 'manual', frequencyPerYear: 12 });
    expect(r.quantity).toBe(1);
  });

  it('realty: income = monthly rent × 12', () => {
    const r = buildAssetFromForm({ ...base, type: 'Недвижимость', name: 'Студия', value: 6_500_000, monthlyRent: 40_000 });
    expect(r.asset).toMatchObject({ paymentPerUnit: 480_000, paymentPerUnitSource: 'manual', ticker: undefined });
  });

  it('realty without rent keeps income calculated from recorded payments', () => {
    const r = buildAssetFromForm({ ...base, type: 'Недвижимость', name: 'Дача', value: 3_000_000 });
    expect(r.asset.paymentPerUnitSource).toBe('fact');
    expect(r.asset.paymentPerUnit).toBeUndefined();
  });

  it('other: keeps currency, price and optional income', () => {
    const r = buildAssetFromForm({ ...base, type: 'Прочее', name: 'Валютный актив', currency: 'usd', quantity: 2, totalCost: 200, annualIncome: 12 });
    expect(r.asset).toMatchObject({ currency: 'USD', currentPrice: 100, paymentPerUnit: 12, paymentPerUnitSource: 'manual', ticker: undefined });
    expect(r.averagePrice).toBe(100);
  });

  it('other: an empty quantity means one unit, as the placeholder promises', () => {
    const r = buildAssetFromForm({ ...base, type: 'Крипта', name: 'stETH', currency: 'USD', quantity: NaN, annualIncome: 40 });
    expect(r.quantity).toBe(1);
  });

  it('other: an explicit zero stays zero; securities still need a quantity', () => {
    expect(buildAssetFromForm({ ...base, type: 'Крипта', name: 'stETH', quantity: 0 }).quantity).toBe(0);
    expect(buildAssetFromForm({ ...base, ticker: 'SBER', quantity: NaN }).quantity).toBe(0);
  });
});
