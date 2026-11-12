import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { NdflSettings, ndflAccountRows } from '@/components/settings/ndfl-settings';
import { clearAllData, getNdflRates } from '@/services/app-settings';
import { ndflAccountLabel } from '@/services/ndfl-rates';
import { db } from '@/db/database';
import { createAssetDraft } from '@/services/asset-factory';

async function seed() {
  const now = new Date();
  const broker = (await db.accounts.add({ name: 'Брокер', createdAt: now, updatedAt: now })) as number;
  const iis = (await db.accounts.add({ name: 'ИИС', createdAt: now, updatedAt: now })) as number;
  const sber = (await db.assets.add(createAssetDraft({ type: 'Акции', name: 'Сбер', dataSource: 'manual' }))) as number;
  const ofz = (await db.assets.add(createAssetDraft({ type: 'Облигации', name: 'ОФЗ', dataSource: 'manual' }))) as number;
  await db.holdings.bulkAdd([
    { accountId: broker, assetId: sber, quantity: 10, quantitySource: 'manual', createdAt: now, updatedAt: now },
    { accountId: broker, assetId: ofz, quantity: 5, quantitySource: 'manual', createdAt: now, updatedAt: now },
    { accountId: iis, assetId: sber, quantity: 5, quantitySource: 'manual', createdAt: now, updatedAt: now },
  ]);
  return { broker, iis };
}

describe('NDFL settings by account', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('lists every account once, with what it holds', async () => {
    await seed();
    const rows = ndflAccountRows(await db.accounts.toArray(), await db.holdings.toArray(), await db.assets.toArray());
    expect(rows.map(({ name, holds }) => ({ name, holds }))).toEqual([
      { name: 'Брокер', holds: 'Акции · Облигации' },
      { name: 'ИИС', holds: 'Акции' },
    ]);
  });

  it('sets the rate of one account', async () => {
    const { broker, iis } = await seed();
    render(<NdflSettings />);

    const iisRow = await screen.findByRole('group', { name: 'НДФЛ: ИИС' });
    expect(within(iisRow).getByRole('button', { name: '13%' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(iisRow).getByRole('button', { name: '0%' }));
    await waitFor(async () => expect((await getNdflRates()).get(iis)).toBe(0));
    expect((await getNdflRates()).get(broker)).toBe(13);
  });

  it('shows a new account as soon as it is created', async () => {
    await seed();
    render(<NdflSettings />);
    await screen.findByRole('group', { name: 'НДФЛ: ИИС' });

    const now = new Date();
    await db.accounts.add({ name: 'Квартира', createdAt: now, updatedAt: now });

    expect(await screen.findByRole('group', { name: 'НДФЛ: Квартира' })).toBeInTheDocument();
    expect(screen.getByText('Пока пусто')).toBeInTheDocument();
  });

  it('labels an account in Счета only when its rate is not the usual 13%', () => {
    expect(ndflAccountLabel(undefined)).toBeNull();
    expect(ndflAccountLabel(13)).toBeNull();
    expect(ndflAccountLabel(0)).toBe('НДФЛ 0%');
    expect(ndflAccountLabel(6.5)).toBe('НДФЛ 6,5%');
  });
});
