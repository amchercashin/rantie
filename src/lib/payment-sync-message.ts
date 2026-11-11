import type { PaymentsOutcome } from '@/services/moex-sync';

export interface SyncMessage {
  text: string;
  tone: 'success' | 'info' | 'error';
}

interface AssetSyncResult {
  success: boolean;
  outcome?: PaymentsOutcome;
}

/**
 * What to tell after reloading one security's payments. Worded by what happened, not by
 * which source failed: "not found in open sources" stays true whichever source comes back.
 * `hadManual` / `hadPayments` describe the payments before the reload — they are kept when
 * nothing new was found.
 */
export function assetSyncMessage(
  name: string,
  result: AssetSyncResult,
  before: { hadManual: boolean; hadPayments: boolean },
): SyncMessage {
  if (!result.success) return { text: `${name}: не удалось загрузить выплаты`, tone: 'error' };
  if (result.outcome === 'unreachable') {
    return { text: `${name}: источник выплат не ответил — попробуйте позже`, tone: 'info' };
  }
  if (result.outcome === 'no-source') {
    if (before.hadManual) {
      return { text: `${name}: в открытых источниках выплат нет — ваши выплаты оставлены`, tone: 'info' };
    }
    if (before.hadPayments) {
      return { text: `${name}: новых выплат в открытых источниках нет — новые добавляйте вручную`, tone: 'info' };
    }
    return { text: `${name}: выплат нет в открытых источниках — если они есть, добавьте вручную`, tone: 'info' };
  }
  return { text: `${name}: выплаты обновлены`, tone: 'success' };
}

/** Summary after reloading a whole category. `names` are those whose payments no source has. */
export function categorySyncMessage(
  type: string,
  counts: { failed: number; unreachable: number; noSource: string[] },
): SyncMessage {
  if (counts.failed > 0) return { text: `Не удалось обновить: ${counts.failed}`, tone: 'error' };
  if (counts.noSource.length > 0) {
    const shown = counts.noSource.slice(0, 3).join(', ');
    const more = counts.noSource.length > 3 ? ` и ещё ${counts.noSource.length - 3}` : '';
    return { text: `${type}: нет в открытых источниках — ${shown}${more}. Их выплаты добавляйте вручную`, tone: 'info' };
  }
  if (counts.unreachable > 0) {
    return { text: `${type}: источник выплат не ответил — попробуйте позже`, tone: 'info' };
  }
  return { text: `${type}: выплаты обновлены`, tone: 'success' };
}
