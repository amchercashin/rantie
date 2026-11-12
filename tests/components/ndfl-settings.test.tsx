import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { NdflSettings, ndflCategoryAccounts } from '@/components/settings/ndfl-settings';
import { clearAllData, getAccountNdflRates } from '@/services/app-settings';
import { db } from '@/db/database';
import { createAssetDraft } from '@/services/asset-factory';

async function seed() {
  const now = new Date();
  const broker = (await db.accounts.add({ name: 'Брокер', createdAt: now, updatedAt: now })) as number;
  const iis = (await db.accounts.add({ name: 'ИИС', createdAt: now, updatedAt: now })) as number;
  const sber = (await db.assets.add(createAssetDraft({ type: 'Акции', name: 'Сбер', dataSource: 'manual' }))) as number;
  const flat = (await db.assets.add(createAssetDraft({ type: 'Недвижимость', name: 'Студия', dataSource: 'manual' }))) as number;
  await db.holdings.bulkAdd([
    { accountId: broker, assetId: sber, quantity: 10, quantitySource: 'manual', createdAt: now, updatedAt: now },
    { accountId: iis, assetId: sber, quantity: 5, quantitySource: 'manual', createdAt: now, updatedAt: now },
    { accountId: broker, assetId: flat, quantity: 1, quantitySource: 'manual', createdAt: now, updatedAt: now },
  ]);
  return { broker, iis, sber, flat };
}

describe('NDFL settings by category and account', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  it('lists under each category the accounts that hold it', async () => {
    await seed();
    const tree = ndflCategoryAccounts(await db.assets.toArray(), await db.holdings.toArray(), await db.accounts.toArray());
    expect(tree).toEqual([
      { category: 'Акции', accounts: [expect.objectContaining({ name: 'Брокер' }), expect.objectContaining({ name: 'ИИС' })] },
      { category: 'Недвижимость', accounts: [expect.objectContaining({ name: 'Брокер' })] },
    ]);
  });

  it('gives an account its own rate inside a category and takes it back', async () => {
    const { iis } = await seed();
    render(<NdflSettings />);

    const iisShares = await screen.findByRole('group', { name: 'НДФЛ: Акции, ИИС' });
    // Follows the category (13% by default) until told otherwise.
    expect(within(iisShares).getByRole('button', { name: '13%' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(iisShares).getByRole('button', { name: '0%' }));
    await waitFor(async () => expect((await getAccountNdflRates()).get(iis)?.get('Акции')).toBe(0));
    expect((await getAccountNdflRates()).get(iis)?.has('Недвижимость')).toBeFalsy();

    fireEvent.click(await screen.findByRole('button', { name: 'своя · сбросить' }));
    await waitFor(async () => expect((await getAccountNdflRates()).get(iis)).toBeUndefined());
  });

  it('shows a new account as soon as it holds the category', async () => {
    const { sber } = await seed();
    render(<NdflSettings />);
    await screen.findByRole('group', { name: 'НДФЛ: Акции, ИИС' });

    const now = new Date();
    const added = (await db.accounts.add({ name: 'Второй брокер', createdAt: now, updatedAt: now })) as number;
    await db.holdings.add({ accountId: added, assetId: sber, quantity: 1, quantitySource: 'manual', createdAt: now, updatedAt: now });

    expect(await screen.findByRole('group', { name: 'НДФЛ: Акции, Второй брокер' })).toBeInTheDocument();
  });
});
