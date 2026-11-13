import { useRestoreBackup } from '@/hooks/use-restore-backup';
import { cn } from '@/lib/utils';

/**
 * The quiet way in for someone who already kept a portfolio here: under the start choices
 * (welcome, empty Доход), a line of small text rather than a fourth button — a newcomer
 * reads past it, a returning user recognises «бэкап» and gets everything back in one step.
 */
export function RestoreBackupLink({ onRestored, className }: { onRestored?: () => void; className?: string }) {
  const restore = useRestoreBackup(onRestored);
  return (
    <>
      <button
        type="button"
        onClick={restore.open}
        disabled={restore.restoring}
        className={cn(
          // 12 + 20 + 12 px: a full 44 px tap target around one line of small text.
          'rounded-xl px-3 py-3 text-[length:var(--hi-text-caption)] leading-5 text-[var(--hi-text-3)]',
          'outline-none focus-visible:ring-2 focus-visible:ring-[var(--hi-gold)]/50 active:bg-[var(--hi-surface)] disabled:opacity-70',
          className,
        )}
      >
        Есть бэкап?{' '}
        <span className="font-semibold text-[var(--hi-text-2)] underline decoration-[var(--hi-line-strong)] decoration-1 underline-offset-4">
          {restore.restoring ? 'Восстанавливаю…' : 'Восстановить'}
        </span>
      </button>
      <input {...restore.inputProps} />
    </>
  );
}
