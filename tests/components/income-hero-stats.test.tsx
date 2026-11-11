import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IncomeHero } from '@/components/main/income-hero';

const props = {
  income: 12000,
  incomePerYear: 144000,
  yieldPercent: 8.6,
  totalValue: 16_300_000,
  mode: 'month' as const,
  onModeChange: vi.fn(),
  animate: false,
};

describe('IncomeHero stats row', () => {
  it('is a button that leads on to the income sources', () => {
    const onStatsClick = vi.fn();
    render(<MemoryRouter><IncomeHero {...props} onStatsClick={onStatsClick} /></MemoryRouter>);

    const row = screen.getByRole('button', { name: /Показать, откуда доход/ });
    expect(row).toHaveAccessibleName(/Доходность 8,6%/);
    expect(row).toHaveTextContent('Капитал');
    fireEvent.click(row);
    expect(onStatsClick).toHaveBeenCalledTimes(1);
  });

  it('stays plain text without a handler', () => {
    render(<MemoryRouter><IncomeHero {...props} /></MemoryRouter>);
    expect(screen.getByText('Доходность')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /откуда доход/ })).toBeNull();
  });
});
