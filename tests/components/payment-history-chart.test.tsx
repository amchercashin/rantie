import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentHistoryChart, type ChartPaymentRecord } from '@/components/shared/payment-history-chart';

const history: ChartPaymentRecord[] = [
  { date: new Date(2025, 6, 10), amount: 541 },
  { date: new Date(2026, 0, 12), amount: 397 },
  { date: new Date(2026, 4, 4), amount: 278 },
  { date: new Date(2026, 11, 9), amount: 535, isForecast: true },
  { date: new Date(2027, 6, 9), amount: 550, isForecast: true },
];

/** The selection frame must wrap the whole column, forecast part included, with a rounded top. */
function expectWholeColumnFramed(container: HTMLElement) {
  const framed = container.querySelectorAll('.ring-2');
  expect(framed).toHaveLength(1);
  const frame = framed[0];
  expect(frame).toHaveClass('rounded-t-md');
  expect(frame.querySelector('[data-part="forecast"]')).not.toBeNull();
  expect(frame.querySelector('[data-part="fact"]')).not.toBeNull();
}

describe('PaymentHistoryChart selection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11));
  });
  afterEach(() => vi.useRealTimers());

  it('frames a fully paid year as one rounded column', () => {
    const { container } = render(<PaymentHistoryChart history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /^2025:/ }));
    const framed = container.querySelectorAll('.ring-2');
    expect(framed).toHaveLength(1);
    expect(framed[0]).toHaveClass('rounded-t-md');
  });

  it('frames the whole column of a year that is part paid, part forecast', () => {
    const { container } = render(<PaymentHistoryChart history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /^2026:/ }));
    expectWholeColumnFramed(container);
  });

  it('frames the hatched column of a year that is forecast only', () => {
    const { container } = render(<PaymentHistoryChart history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /^2027:/ }));
    expectWholeColumnFramed(container);
  });
});

describe('PaymentHistoryChart year total', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11));
  });
  afterEach(() => vi.useRealTimers());

  it('tells the forecast as an approximate total for a year with no payments yet, not 0', () => {
    render(<PaymentHistoryChart history={[...history, { date: new Date(2027, 11, 1), amount: 0.44, isForecast: true }]} />);
    fireEvent.click(screen.getByRole('button', { name: '2027: ≈550,44 ₽' }));
    expect(screen.getByText('≈550,44 ₽')).toBeInTheDocument();
    expect(screen.queryByText('0 ₽')).toBeNull();
  });

  it('keeps the paid total for a year that is part paid, part forecast', () => {
    render(<PaymentHistoryChart history={history} />);
    fireEvent.click(screen.getByRole('button', { name: '2026: 675 ₽' }));
    expect(screen.getByText('675 ₽')).toBeInTheDocument();
  });
});

describe('PaymentHistoryChart payments ahead', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13));
  });
  afterEach(() => vi.useRealTimers());

  it('draws a real record dated ahead (a fixed coupon) on top, not as paid', () => {
    const coupons: ChartPaymentRecord[] = [
      { date: new Date(2026, 5, 17), amount: 95.44 },
      { date: new Date(2026, 11, 16), amount: 82.72 },
    ];
    const { container } = render(<PaymentHistoryChart history={coupons} />);
    fireEvent.click(screen.getByRole('button', { name: '2026: 95,44 ₽' }));
    expectWholeColumnFramed(container);
    expect(screen.getByText('ожидается')).toBeInTheDocument();
  });
});
