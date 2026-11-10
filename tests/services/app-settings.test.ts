import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db/database';
import { updateAppSetting, getNdflRates, updateNdflRate, DEFAULT_NDFL_RATE } from '@/services/app-settings';
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

  describe('ndfl rates', () => {
    it('reads rates without index cursors, which Safari can fail after the demo is removed', async () => {
      await db.assets.add(createAssetDraft({ type: "Облигации", name: "ОФЗ", dataSource: "manual" }));
      const broken = vi.spyOn(db.assets, 'orderBy').mockImplementation(() => {
        throw new DOMException('Unable to open cursor', 'UnknownError');
      });
      const rates = await getNdflRates();
      expect(rates.get('Облигации')).toBe(DEFAULT_NDFL_RATE);
      broken.mockRestore();
    });

    it('returns empty map when no rates are set', async () => {
      const rates = await getNdflRates();
      expect(rates.size).toBe(0);
    });

    it('stores and retrieves a rate for a category', async () => {
      await updateNdflRate('Акции', 13);
      const rates = await getNdflRates();
      expect(rates.get('Акции')).toBe(13);
    });

    it('handles multiple categories independently', async () => {
      await updateNdflRate('Акции', 13);
      await updateNdflRate('Облигации', 15);
      await updateNdflRate('Вклады', 0);
      const rates = await getNdflRates();
      expect(rates.get('Акции')).toBe(13);
      expect(rates.get('Облигации')).toBe(15);
      expect(rates.get('Вклады')).toBe(0);
    });

    it('overwrites previous rate for same category', async () => {
      await updateNdflRate('Акции', 13);
      await updateNdflRate('Акции', 15);
      const rates = await getNdflRates();
      expect(rates.get('Акции')).toBe(15);
    });

    it('ignores non-ndfl settings keys', async () => {
      await updateAppSetting('defaultPeriod', 'year');
      await updateNdflRate('Акции', 13);
      const rates = await getNdflRates();
      expect(rates.size).toBe(1);
      expect(rates.has('Акции')).toBe(true);
    });

    it('gives every held category 13% until the user picks a rate', async () => {
      await db.assets.add(createAssetDraft({ type: 'Акции', name: 'Сбер', dataSource: 'manual' }));
      await db.assets.add(createAssetDraft({ type: 'Вклады', name: 'Вклад', dataSource: 'manual' }));
      const rates = await getNdflRates();
      expect(DEFAULT_NDFL_RATE).toBe(13);
      expect(rates.get('Акции')).toBe(13);
      expect(rates.get('Вклады')).toBe(13);
    });

    it('keeps a rate the user chose, including 0%', async () => {
      await db.assets.add(createAssetDraft({ type: 'Акции', name: 'Сбер', dataSource: 'manual' }));
      await db.assets.add(createAssetDraft({ type: 'Недвижимость', name: 'Студия', dataSource: 'manual' }));
      await updateNdflRate('Акции', 0);
      await updateNdflRate('Недвижимость', 4);
      const rates = await getNdflRates();
      expect(rates.get('Акции')).toBe(0);
      expect(rates.get('Недвижимость')).toBe(4);
    });

    it('handles custom fractional rates', async () => {
      await updateNdflRate('Недвижимость', 6.5);
      const rates = await getNdflRates();
      expect(rates.get('Недвижимость')).toBe(6.5);
    });
  });
});
