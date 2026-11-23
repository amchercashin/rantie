import { describe, expect, it } from 'vitest';
import { unitValue, unitValueOwn, unitValueRub } from '@/models/asset-kind';

describe('unitValue', () => {
  it('adds the accrued interest to a bond price — what a buyer pays', () => {
    expect(unitValue({ type: 'Облигации', currentPrice: 1038.64, accruedInterest: 69.08 })).toBeCloseTo(1107.72);
  });

  it('ignores accrued interest outside bonds', () => {
    expect(unitValue({ type: 'Акции', currentPrice: 300, accruedInterest: 5 })).toBe(300);
  });

  it('is unknown without a price, not zero and not the purchase price', () => {
    expect(unitValue({ type: 'Крипта', currentPrice: undefined })).toBeNull();
    expect(unitValue({ type: 'Облигации', currentPrice: undefined, accruedInterest: 69.08 })).toBeNull();
  });
});

describe('unitValueRub / unitValueOwn', () => {
  const rates = new Map([['USD', 90]]);

  it('converts USD replacement bond price by USD rate and RUB NKD as RUB', () => {
    const bond = {
      type: 'Облигации',
      currency: 'USD',
      currentPrice: 1000,
      accruedInterest: 1800,
      accruedInterestCurrency: 'RUB',
    };
    expect(unitValueRub(bond, rates)).toBeCloseTo(91800);
    expect(unitValueOwn(bond, rates)).toBeCloseTo(1020);
  });

  it('converts regular foreign bond using asset currency for both price and NKD', () => {
    const bond = {
      type: 'Облигации',
      currency: 'USD',
      currentPrice: 1000,
      accruedInterest: 25,
    };
    expect(unitValueRub(bond, rates)).toBeCloseTo(92250);
    expect(unitValueOwn(bond, rates)).toBeCloseTo(1025);
  });

  it('returns 0 in rubles when exchange rate is missing, and avoids NaN in own currency', () => {
    const bond = {
      type: 'Облигации',
      currency: 'USD',
      currentPrice: 1000,
      accruedInterest: 1800,
      accruedInterestCurrency: 'RUB',
    };
    expect(unitValueRub(bond, new Map())).toBe(0);
    expect(unitValueOwn(bond, new Map())).toBe(1000);
  });

  it('returns null when currentPrice is missing', () => {
    const bond = {
      type: 'Облигации',
      currency: 'USD',
      currentPrice: undefined,
      accruedInterest: 1800,
      accruedInterestCurrency: 'RUB',
    };
    expect(unitValueRub(bond, rates)).toBeNull();
    expect(unitValueOwn(bond, rates)).toBeNull();
  });
});
