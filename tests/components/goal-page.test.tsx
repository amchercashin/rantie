import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackProvider } from '@/components/ds/feedback';
import { GoalPage } from '@/pages/goal-page';
import { clearAllData } from '@/services/app-settings';
import { loadDemoPortfolio } from '@/services/demo-portfolio';
import { setIncomeGoal } from '@/services/income-goal';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/goal']}>
      <FeedbackProvider>
        <GoalPage />
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

const forecastToggle = () => screen.findByRole('button', { name: /Когда портфель оплатит цель/ });

describe('GoalPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
  });

  it('keeps the forecast folded until it is opened, then remembers it open; the chart switches to capital', async () => {
    await loadDemoPortfolio();
    const { unmount } = renderPage();
    const toggle = await forecastToggle();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Цель будет достигнута')).toBeNull();
    expect(screen.queryByText('Пополнения')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Цель будет достигнута')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /График дохода/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Капитал' }));
    expect(screen.getByRole('img', { name: /График капитала/ })).toBeInTheDocument();
    unmount();

    renderPage();
    expect(await forecastToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers no forecast before there is a goal', async () => {
    await loadDemoPortfolio();
    await setIncomeGoal(null);
    renderPage();
    expect(await screen.findByLabelText('Нужно в месяц')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /Когда портфель оплатит цель/ })).toBeNull();
  });

  it('holds up with an empty portfolio: asks for a yield, then says there is nothing to grow yet', async () => {
    await setIncomeGoal(100_000);
    renderPage();
    fireEvent.click(await forecastToggle());
    expect(screen.getByText(/Укажите доходность больше нуля/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Своя доходность в год, после НДФЛ'), { target: { value: '8' } });
    expect(screen.getByText(/Пока портфель ничего не приносит/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /График/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('Каждый месяц'), { target: { value: '50000' } });
    expect(screen.getByTestId('goal-year')).toHaveTextContent(/^в 20\d\d году$/);
    expect(screen.getByRole('img', { name: /График дохода/ })).toBeInTheDocument();
  });
});
