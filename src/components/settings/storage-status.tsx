import { useRef } from 'react';
import { HardDrive, ShieldCheck } from 'lucide-react';
import { useFeedback } from '@/components/ds/feedback';
import { useStorageProtection } from '@/hooks/use-storage-protection';
import { getIsStandalone, getPlatform } from '@/hooks/use-install-prompt';
import { describeStorageStatus } from '@/lib/storage-protection';
import { cn } from '@/lib/utils';

/**
 * "Where is my portfolio?" — the first row of the Данные card.
 * Multi-line on purpose: the explanation is the point, so it must not be truncated like a ListRow subtitle.
 */
export function StorageStatusRow() {
  const { toast } = useFeedback();
  const { state, request } = useStorageProtection();
  const platform = useRef(getPlatform()).current;
  const standalone = useRef(getIsStandalone()).current;

  if (state === null) return null;
  const status = describeStorageStatus({ state, platform, standalone });

  const handleClick = async () => {
    const next = await request();
    if (next === 'protected') toast('Защита от очистки включена');
    else toast('Браузер не включил защиту. Сохраните бэкап — так надёжнее', 'info');
  };

  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]',
          status.tone === 'ok'
            ? 'bg-[var(--hi-positive-tint)] text-[var(--hi-positive)]'
            : 'bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]',
        )}
      >
        {status.tone === 'ok' ? <ShieldCheck /> : <HardDrive />}
      </span>
      <div className="min-w-0">
        <div className="text-[length:var(--hi-text-body)] leading-snug text-[var(--hi-text)]">{status.title}</div>
        <div className="mt-0.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-3)]">{status.detail}</div>
      </div>
    </>
  );

  const classes =
    'relative flex w-full gap-3 px-4 py-3.5 text-left after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden';

  return status.canRequest ? (
    <button type="button" onClick={handleClick} className={cn(classes, 'hi-pressable active:bg-[var(--hi-raised)]')}>
      {content}
    </button>
  ) : (
    <div className={classes} data-testid="storage-status">
      {content}
    </div>
  );
}
