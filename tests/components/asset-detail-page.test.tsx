import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FeedbackProvider } from '@/components/ds/feedback';
import { AssetDetailPage } from '@/pages/asset-detail-page';
import { db } from '@/db/database';
import { clearAllData } from '@/services/app-settings';
import { createAssetDraft } from '@/services/asset-factory';

function renderAssetRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FeedbackProvider>
        <Routes>
          <Route path="/asset/:id" element={<AssetDetailPage />} />
        </Routes>
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

describe('AssetDetailPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllData();
  });

  it('shows "Актив не найден" for a missing numeric asset ID', async () => {
    renderAssetRoute('/asset/99999');
    expect(await screen.findByText('Актив не найден')).toBeInTheDocument();
  });

  it('shows "Актив не найден" for a non-numeric asset ID', async () => {
    renderAssetRoute('/asset/not-a-number');
    expect(await screen.findByText('Актив не найден')).toBeInTheDocument();
  });

  it('calculates YoC across multiple accounts using only holdings that have averagePrice', async () => {
    const now = new Date();
    const acc1 = (await db.accounts.add({ name: 'Брокер 1', createdAt: now, updatedAt: now })) as number;
    const acc2 = (await db.accounts.add({ name: 'Брокер 2', createdAt: now, updatedAt: now })) as number;

    const assetId = (await db.assets.add(
      createAssetDraft({
        type: 'Акции',
        ticker: 'SBER',
        name: 'Сбербанк',
        currency: 'RUB',
        currentPrice: 300,
        dataSource: 'manual',
        paymentPerUnit: 20,
        paymentPerUnitSource: 'manual',
        frequencyPerYear: 1,
        now,
      }),
    )) as number;

    // 100 shares bought at 200 RUB (costBasis = 20 000) + 100 shares without averagePrice.
    // Default NDFL is 13% on both accounts (taxMultiplier = 0.87).
    // YoC = (20 * 100 * 0.87) / 20 000 * 100 = 8,7% (not 17,4% from all 200 shares).
    await db.holdings.bulkAdd([
      { accountId: acc1, assetId, quantity: 100, averagePrice: 200, quantitySource: 'manual', createdAt: now, updatedAt: now },
      { accountId: acc2, assetId, quantity: 100, quantitySource: 'manual', createdAt: now, updatedAt: now },
    ]);

    renderAssetRoute(`/asset/${assetId}`);

    expect(await screen.findByText('Доход на вложенное: 8,7% годовых')).toBeInTheDocument();
    expect(screen.getByText(/в год на 1 бумагу, до НДФЛ/)).toBeInTheDocument();
  });
});
