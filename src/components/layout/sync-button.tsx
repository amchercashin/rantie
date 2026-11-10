import { RefreshCw } from 'lucide-react';
import { useSyncContext } from '@/contexts/sync-context';
import { useFeedback } from '@/components/ds/feedback';
import { cn, formatRelativeTime } from '@/lib/utils';

/** Header pill: last MOEX update time + manual refresh of prices and payments. */
export function SyncButton() {
  const { syncing, lastSyncAt, triggerSync } = useSyncContext();
  const { toast } = useFeedback();

  const run = async () => {
    const result = await triggerSync();
    if (!result) return;
    if (result.failed > 0) toast(`Не удалось обновить: ${result.errors.slice(0, 2).join(', ')}`, 'error');
    else if (result.synced > 0) toast('Цены и выплаты обновлены');
    else if (result.ratesUpdated.length > 0) toast('Курсы валют обновлены');
    else if (result.warnings.length > 0) toast(result.warnings[0], 'info');
    else toast('Нет биржевых активов для обновления', 'info');
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={syncing}
      aria-label="Обновить цены и выплаты с биржи"
      className="hi-pressable inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--hi-line)] bg-[var(--hi-surface)] pl-2.5 pr-3 text-[length:var(--hi-text-micro)] font-semibold text-[var(--hi-text-2)] active:bg-[var(--hi-raised)] disabled:opacity-80"
    >
      <RefreshCw className={cn('size-3.5 text-[var(--hi-gold)]', syncing && 'animate-spin')} />
      {syncing ? 'Обновляю…' : lastSyncAt ? formatRelativeTime(lastSyncAt) : 'Обновить'}
    </button>
  );
}
