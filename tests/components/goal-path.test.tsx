import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoalPath } from '@/components/main/goal-path';

describe('GoalPath', () => {
  it('renders nothing while the goal or the income is still loading', () => {
    const { container, rerender } = render(
      <GoalPath incomePerMonth={null} goalPerMonth={150_000} mode="month" onOpen={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<GoalPath incomePerMonth={46_819} goalPerMonth={undefined} mode="month" onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the goal page from the card', () => {
    const onOpen = vi.fn();
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={150_000} mode="month" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Открыть цель и прогноз/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('invites to set a goal when there is none', () => {
    const onOpen = vi.fn();
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={null} mode="month" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Поставить цель по доходу/ }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows the share of the way and the days the portfolio pays for', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={150_000} mode="month" onOpen={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('31%');
    expect(screen.getByText('Портфель оплачивает 9 дней из 30')).toBeInTheDocument();
  });

  it('speaks in months of a year in the yearly view, with the same share', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={150_000} mode="year" onOpen={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('31%');
    expect(screen.getByText('Портфель оплачивает 3 месяца из 12')).toBeInTheDocument();
  });

  it('celebrates quietly once the goal is reached', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={40_000} mode="month" onOpen={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('117%');
    expect(screen.getByText('цель достигнута')).toBeInTheDocument();
    expect(screen.getByText('Портфель оплачивает весь месяц')).toBeInTheDocument();
  });
});
