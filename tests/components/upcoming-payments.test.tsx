import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { UpcomingPayments } from '@/components/main/upcoming-payments';
import type { Asset } from '@/models/types';
import type { ProjectedPayment } from '@/services/income-projection';

const NOW = new Date(2026, 10, 13);
const asset = (id: number, name: string): Asset => ({
  id, name, type: 'Фонды', ticker: `F${id}`, dataSource: 'moex', paymentPerUnitSource: 'fact',
  frequencyPerYear: 12, frequencySource: 'moex', createdAt: NOW, updatedAt: NOW,
});
const pay = (assetId: number, day: number, basis: ProjectedPayment['basis']): ProjectedPayment => ({
  assetId, date: new Date(2026, 10, day), amount: 1000, perUnit: 10, estimated: false, basis,
});

describe('UpcomingPayments', () => {
  it('labels each payment the way the calendar does', () => {
    render(
      <MemoryRouter>
        <UpcomingPayments
          now={NOW}
          assetsById={new Map([[1, asset(1, 'Нордвей')], [2, asset(2, 'ЗОЛЯ')], [3, asset(3, 'ОФЗ')]])}
          payments={[pay(1, 28, 'last-year'), pay(2, 30, 'average'), pay(3, 30, 'scheduled')]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/как год назад/)).toBeInTheDocument();
    expect(screen.getByText(/средняя выплата/)).toBeInTheDocument();
    expect(screen.getAllByText(/ожидается/)).toHaveLength(1);
  });
});
