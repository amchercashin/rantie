import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoalAnswer, topUpsText } from '@/components/goal/goal-answer';

const now = new Date(2026, 10, 12, 12);
// The demo portfolio: 46 787 ₽ a month after NDFL at 7,6%.
const demo = { incomePerMonth: 46_787, yieldPercent: 7.6, monthly: 0, yearly: 0, now };

describe('GoalAnswer', () => {
  it('asks for a goal when there is none', () => {
    render(<GoalAnswer {...demo} goalPerMonth={null} />);
    expect(screen.getByText(/Введите цель/)).toBeInTheDocument();
  });

  it('answers with the year when reinvesting alone, and invites to add top-ups', () => {
    render(<GoalAnswer {...demo} goalPerMonth={100_000} />);
    expect(screen.getByTestId('goal-year')).toHaveTextContent('в 2037 году');
    expect(screen.getByText(/примерно через 10 лет/)).toBeInTheDocument();
    expect(screen.getByText('если реинвестировать выплаты')).toBeInTheDocument();
    expect(screen.getByText(/Пополнения ускорят/)).toBeInTheDocument();
  });

  it('names the top-ups it counts with, and keeps the other scenario in sight', () => {
    render(<GoalAnswer {...demo} goalPerMonth={100_000} monthly={50_000} />);
    expect(screen.getByTestId('goal-year')).toHaveTextContent('в 2032 году');
    expect(screen.getByText('с пополнениями 50 000 ₽ в месяц')).toBeInTheDocument();
    expect(screen.getByText('Без пополнений — в 2037 году, примерно через 10 лет.')).toBeInTheDocument();
  });

  it('celebrates a goal already reached', () => {
    render(<GoalAnswer {...demo} goalPerMonth={40_000} />);
    expect(screen.getByText('Цель достигнута')).toBeInTheDocument();
    expect(screen.getByText(/на 6 787 ₽ больше цели/)).toBeInTheDocument();
  });

  it('says "later" beyond fifty years instead of a date', () => {
    render(<GoalAnswer {...demo} yieldPercent={0.5} goalPerMonth={1_000_000} />);
    expect(screen.getByTestId('goal-year')).toHaveTextContent('позже 2076 года');
    expect(screen.getByText(/больше чем через 50 лет/)).toBeInTheDocument();
  });

  it('asks for a positive yield instead of promising anything', () => {
    render(<GoalAnswer {...demo} yieldPercent={0} goalPerMonth={100_000} monthly={50_000} />);
    expect(screen.getByText(/Укажите доходность больше нуля/)).toBeInTheDocument();
    expect(screen.queryByTestId('goal-year')).toBeNull();
  });
});

describe('topUpsText', () => {
  it('names monthly and yearly top-ups', () => {
    const text = (monthly: number, yearly: number) => topUpsText(monthly, yearly).replace(/\u00a0/g, ' ');
    expect(text(50_000, 0)).toBe('50 000 ₽ в месяц');
    expect(text(0, 200_000)).toBe('200 000 ₽ раз в год');
    expect(text(50_000, 200_000)).toBe('50 000 ₽ в месяц и 200 000 ₽ раз в год');
  });
});
