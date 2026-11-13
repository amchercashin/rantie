import { describe, expect, it } from 'vitest';
import { unitValue } from '@/models/asset-kind';

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
