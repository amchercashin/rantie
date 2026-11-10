import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoalPath } from '@/components/main/goal-path';
import { GoalSheet } from '@/components/main/goal-sheet';

describe('GoalPath', () => {
  it('renders nothing while the goal or the income is still loading', () => {
    const { container, rerender } = render(
      <GoalPath incomePerMonth={null} goalPerMonth={150_000} mode="month" onEdit={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<GoalPath incomePerMonth={46_819} goalPerMonth={undefined} mode="month" onEdit={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('invites to set a goal when there is none', () => {
    const onEdit = vi.fn();
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={null} mode="month" onEdit={onEdit} />);
    fireEvent.click(screen.getByRole('button', { name: /Поставить цель по доходу/ }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('shows the share of the way and the days the portfolio pays for', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={150_000} mode="month" onEdit={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('31%');
    expect(screen.getByText('Портфель оплачивает 9 дней из 30')).toBeInTheDocument();
  });

  it('speaks in months of a year in the yearly view, with the same share', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={150_000} mode="year" onEdit={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('31%');
    expect(screen.getByText('Портфель оплачивает 3 месяца из 12')).toBeInTheDocument();
  });

  it('celebrates quietly once the goal is reached', () => {
    render(<GoalPath incomePerMonth={46_819} goalPerMonth={40_000} mode="month" onEdit={vi.fn()} />);
    expect(screen.getByTestId('goal-percent')).toHaveTextContent('117%');
    expect(screen.getByText('цель достигнута')).toBeInTheDocument();
    expect(screen.getByText('Портфель оплачивает весь месяц')).toBeInTheDocument();
  });
});

describe('GoalSheet', () => {
  it('saves the typed amount and offers to remove an existing goal', async () => {
    const onSave = vi.fn();
    render(
      <GoalSheet open onOpenChange={vi.fn()} goalPerMonth={100_000} incomePerMonth={46_819} taxed onSave={onSave} />,
    );
    const input = screen.getByLabelText('Нужно в месяц');
    expect(input).toHaveValue('100 000');
    fireEvent.change(input, { target: { value: '150000' } });
    expect(input).toHaveValue('150 000');
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(150_000));

    fireEvent.click(screen.getByRole('button', { name: 'Убрать цель' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
  });

  it('does not save an empty amount', () => {
    render(<GoalSheet open onOpenChange={vi.fn()} goalPerMonth={null} incomePerMonth={46_819} taxed onSave={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Убрать цель' })).not.toBeInTheDocument();
  });
});
