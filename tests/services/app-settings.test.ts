import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db/database';
import {
  updateAppSetting, getNdflRates, updateNdflRate, DEFAULT_NDFL_RATE, migrateNdflToAccounts,
} from '@/services/app-settings';
import { deleteAccount } from '@/hooks/use-accounts';
import { createAssetDraft } from '@/services/asset-factory';

describe('app-settings', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('persists and reads a setting', async () => {
    await updateAppSetting('someKey', 'someValue');
    const rows = await db.table('settings').toArray();
    expect(rows).toContainEqual({ key: 'someKey', value: 'someValue' });
  });

  async function addAccount(name: string): Promise<number> {
    const now = new Date();
    return (await db.accounts.add({ name, createdAt: now, updatedAt: now })) as number;
  }

  async function hold(accountId: number, type: string): Promise<void> {
    const now = new Date();
    const assetId = (await db.assets.add(createAssetDraft({ type, name: `${type} ${accountId}`, dataSource: 'manual' }))) as number;
    await db.holdings.add({ accountId, assetId, quantity: 1, quantitySource: 'manual', createdAt: now, updatedAt: now });
  }

  describe('ndfl rates per account', () => {
    it('reads rates without index cursors, which Safari can fail after the demo is removed', async () => {
      const id = await addAccount('Брокер');
      const broken = vi.spyOn(db.accounts, 'orderBy').mockImplementation(() => {
        throw new DOMException('Unable to open cursor', 'UnknownError');
      });
      expect((await getNdflRates()).get(id)).toBe(DEFAULT_NDFL_RATE);
      broken.mockRestore();
    });

    it('is empty without accounts', async () => {
      expect((await getNdflRates()).size).toBe(0);
    });

    it('gives every account 13% until the user picks a rate', async () => {
      const broker = await addAccount('Брокер');
      const iis = await addAccount('ИИС');
      const rates = await getNdflRates();
      expect(DEFAULT_NDFL_RATE).toBe(13);
      expect(rates.get(broker)).toBe(13);
      expect(rates.get(iis)).toBe(13);
    });

    it('keeps a rate the user chose, including 0% and fractions', async () => {
      const iis = await addAccount('ИИС');
      const flat = await addAccount('Квартира');
      await updateNdflRate(iis, 0);
      await updateNdflRate(flat, 6.5);
      const rates = await getNdflRates();
      expect(rates.get(iis)).toBe(0);
      expect(rates.get(flat)).toBe(6.5);
    });

    it('ignores other settings and accounts that no longer exist', async () => {
      const id = await addAccount('Брокер');
      await updateAppSetting('defaultPeriod', 'year');
      await updateNdflRate(999, 0);
      const rates = await getNdflRates();
      expect([...rates.keys()]).toEqual([id]);
    });

    it('goes away with the account', async () => {
      const iis = await addAccount('ИИС');
      const broker = await addAccount('Брокер');
      await updateNdflRate(iis, 0);
      await updateNdflRate(broker, 15);
      await deleteAccount(iis);
      const keys = (await db.settings.toArray()).map((r) => r.key);
      expect(keys).not.toContain(`ndfl@${iis}`);
      expect(keys).toContain(`ndfl@${broker}`);
    });
  });

  describe('carrying old per-category rates over to accounts', () => {
    it('gives an account the rate all its categories had, once', async () => {
      const iis = await addAccount('ИИС');
      const broker = await addAccount('Брокер');
      await hold(iis, 'Облигации');
      await hold(broker, 'Акции');
      await hold(broker, 'Облигации');
      await db.settings.bulkPut([
        { key: 'ndfl-Облигации', value: '0' },
        { key: 'ndfl-Акции', value: '13' },
      ]);

      await migrateNdflToAccounts();

      const rates = await getNdflRates();
      expect(rates.get(iis)).toBe(0); // its only category was at 0%
      expect(rates.get(broker)).toBe(13); // mixed 13% and 0%: the default
      // The old keys stay for a rollback to the previous version; the marker stops a second pass.
      const keys = (await db.settings.toArray()).map((r) => r.key);
      expect(keys).toContain('ndfl-Облигации');
      expect(keys).toContain('ndfl@migrated');

      // A second start changes nothing.
      await updateNdflRate(iis, 15);
      await migrateNdflToAccounts();
      expect((await getNdflRates()).get(iis)).toBe(15);
    });

    it('takes a rate set for an account inside a category, and keeps an account rate already set', async () => {
      const iis = await addAccount('ИИС');
      const flat = await addAccount('Квартира');
      await hold(iis, 'Акции');
      await hold(flat, 'Недвижимость');
      await db.settings.bulkPut([
        { key: `ndfl@${iis}:Акции`, value: '0' },
        { key: 'ndfl-Недвижимость', value: '4' },
        { key: `ndfl@${flat}`, value: '6' },
      ]);

      await migrateNdflToAccounts();

      const rates = await getNdflRates();
      expect(rates.get(iis)).toBe(0);
      expect(rates.get(flat)).toBe(6);
      expect([...(await getNdflRates()).keys()]).toEqual([iis, flat]);
    });
  });
});
