import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { IncomeHero } from '@/components/main/income-hero';
import { SummaryCard } from '@/components/shared/summary-card';
import { AddPaymentForm } from '@/components/payments/add-payment-form';
import { NdflSettings } from '@/components/settings/ndfl-settings';
import { AssetRow } from '@/components/category/asset-row';
import { clearAllData } from '@/services/app-settings';
import { db } from '@/db/database';
import { createAssetDraft } from '@/services/asset-factory';

describe('tax disclosure UI', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('marks the main income as shown after NDFL', () => {
    render(
      <IncomeHero
        income={12000}
        incomePerYear={144000}
        yieldPercent={8.2}
        totalValue={500000}
        mode="month"
        onModeChange={vi.fn()}
        animate={false}
      />,
    );

    expect(screen.getByText('расчётный пассивный доход')).toBeInTheDocument();
    expect(screen.getByText('после НДФЛ')).toBeInTheDocument();
  });

  it('marks the income summary card as shown after NDFL', () => {
    render(
      <SummaryCard
        incomePerMonth={12000}
        totalValue={500000}
        yieldPercent={8.2}
        portfolioSharePercent={40}
        badges={<span>факт</span>}
      />,
    );

    expect(screen.getByText('Доход в месяц')).toBeInTheDocument();
    expect(screen.getByText('после НДФЛ')).toBeInTheDocument();
    expect(screen.getByText('факт')).toBeInTheDocument();
  });

  it('asks for manual payment amounts before NDFL', () => {
    render(
      <AddPaymentForm
        assetId={1}
        paymentType="dividend"
        currency="RUB"
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText('До НДФЛ')).toHaveAccessibleName('Сумма выплаты до НДФЛ, RUB');
  });

  it('explains in settings that payments are stored before tax and income is shown after tax', async () => {
    await db.assets.add(createAssetDraft({
      type: 'Акции',
      name: 'Сбер',
      dataSource: 'manual',
    }));

    render(<NdflSettings />);

    expect(await screen.findByText('НДФЛ с дохода')).toBeInTheDocument();
    expect(screen.getByText('Выплаты хранятся до налога. Доход и доходность считаются после применения ставки.')).toBeInTheDocument();
  });

  it('keeps ticker, quantity and position value together under the asset name', () => {
    const asset = {
      ...createAssetDraft({
        type: 'Акции',
        name: 'ГАЗПРОМ ao',
        ticker: 'GAZP',
        isin: 'RU0007661625',
        dataSource: 'manual',
      }),
      id: 1,
    };

    const { container } = render(
      <MemoryRouter>
        <AssetRow
          asset={asset}
          stats={{
            assetId: 1,
            totalQuantity: 20790,
            annualIncomePerUnit: 0,
            incomePerMonth: 0,
            incomePerYear: 0,
            value: 2600000,
            yieldPercent: 0,
            portfolioSharePercent: 70.9,
            currency: 'RUB',
            rateToRub: 1,
            rateMissing: false,
          }}
        />
      </MemoryRouter>,
    );

    const rowText = (container.textContent ?? '').replace(/\u00a0/g, ' ');
    const meta = 'GAZP · 20 790 шт · 2,6 млн ₽';
    expect(rowText.indexOf('ГАЗПРОМ ao')).toBeGreaterThan(-1);
    expect(rowText.indexOf(meta)).toBeGreaterThan(rowText.indexOf('ГАЗПРОМ ao'));
    expect(rowText.indexOf(meta)).toBeLessThan(rowText.indexOf('0 ₽'));
  });
});
