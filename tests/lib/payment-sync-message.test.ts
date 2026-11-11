import { describe, it, expect } from 'vitest';
import { assetSyncMessage, categorySyncMessage } from '@/lib/payment-sync-message';

const NOTHING = { hadManual: false, hadPayments: false };

describe('assetSyncMessage', () => {
  it('reports success when payments loaded', () => {
    expect(assetSyncMessage('SBER', { success: true, outcome: 'loaded' }, NOTHING))
      .toEqual({ text: 'SBER: выплаты обновлены', tone: 'success' });
  });

  it('treats a bond without an outcome as updated', () => {
    expect(assetSyncMessage('ОФЗ', { success: true }, NOTHING).tone).toBe('success');
  });

  it('reports a failure', () => {
    expect(assetSyncMessage('SBER', { success: false }, NOTHING).tone).toBe('error');
  });

  it('does not claim an update when no source has the payments', () => {
    const msg = assetSyncMessage('ПАРУС-НиНо', { success: true, outcome: 'no-source' }, NOTHING);
    expect(msg.tone).toBe('info');
    expect(msg.text).toContain('нет в открытых источниках');
    expect(msg.text).toContain('вручную');
  });

  it('says the manual payments were kept', () => {
    const msg = assetSyncMessage('X', { success: true, outcome: 'no-source' }, { hadManual: true, hadPayments: true });
    expect(msg.text).toContain('ваши выплаты оставлены');
  });

  it('says only new payments are missing when older ones are stored', () => {
    const msg = assetSyncMessage('X', { success: true, outcome: 'no-source' }, { hadManual: false, hadPayments: true });
    expect(msg.text).toContain('новых выплат');
  });

  it('asks to retry when a source did not answer', () => {
    const msg = assetSyncMessage('X', { success: true, outcome: 'unreachable' }, NOTHING);
    expect(msg).toEqual({ text: 'X: источник выплат не ответил — попробуйте позже', tone: 'info' });
  });
});

describe('categorySyncMessage', () => {
  it('reports success', () => {
    expect(categorySyncMessage('Акции', { failed: 0, unreachable: 0, noSource: [] }))
      .toEqual({ text: 'Акции: выплаты обновлены', tone: 'success' });
  });

  it('puts failures first', () => {
    expect(categorySyncMessage('Акции', { failed: 2, unreachable: 1, noSource: ['A'] }).tone).toBe('error');
  });

  it('names up to three securities without a source', () => {
    const msg = categorySyncMessage('Фонды', { failed: 0, unreachable: 0, noSource: ['A', 'B', 'C', 'D', 'E'] });
    expect(msg.text).toBe('Фонды: нет в открытых источниках — A, B, C и ещё 2. Их выплаты добавляйте вручную');
    expect(msg.tone).toBe('info');
  });

  it('asks to retry when a source did not answer', () => {
    expect(categorySyncMessage('Акции', { failed: 0, unreachable: 1, noSource: [] }).text)
      .toBe('Акции: источник выплат не ответил — попробуйте позже');
  });
});
