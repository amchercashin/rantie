import { describe, expect, it } from 'vitest';
import { basisLabel } from '@/lib/payment-basis';

describe('basisLabel', () => {
  it('names a repeated payment as the calendar does, never «ожидается»', () => {
    expect(basisLabel({ basis: 'last-year', estimated: false })).toBe('как год назад');
    expect(basisLabel({ basis: 'average', estimated: false })).toBe('средняя выплата');
  });

  it('keeps «ожидается» for a real record dated ahead', () => {
    expect(basisLabel({ basis: 'scheduled', estimated: false })).toBe('ожидается');
  });

  it('adds the conditional date to the user\'s own amount', () => {
    expect(basisLabel({ basis: 'fixed', estimated: true })).toBe('ваша сумма · дата условная');
  });
});
