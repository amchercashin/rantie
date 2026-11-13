import { useRef, useState, type ChangeEvent } from 'react';
import { db } from '@/db/database';
import { useFeedback } from '@/components/ds/feedback';
import { markBackupDone } from '@/lib/backup-reminder';
import { plural } from '@/lib/utils';
import { importAllData, readBackupSummary, type BackupSummary } from '@/services/backup';

function countsText({ accounts, assets }: BackupSummary): string {
  return `${accounts} ${plural(accounts, ['счёт', 'счёта', 'счетов'])}, ${assets} ${plural(assets, ['актив', 'актива', 'активов'])}`;
}

/**
 * «Восстановить из бэкапа»: pick a file, check it, replace the data on this device.
 * Asks first only when there is something to lose — on an empty device (the welcome, an empty Доход)
 * the file is restored at once. Spread `inputProps` on an <input> rendered next to the button: inside
 * the welcome it has to live in the welcome's own portal, because #root is inert while it is open.
 */
export function useRestoreBackup(onRestored?: () => void) {
  const { toast, confirm } = useFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [restoring, setRestoring] = useState(false);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || busy.current) return;
    busy.current = true;
    setRestoring(true);
    try {
      const json = await file.text();
      const summary = readBackupSummary(json);
      if ((await db.accounts.count()) > 0) {
        const ok = await confirm({
          title: 'Восстановить из бэкапа?',
          description: `В файле: ${countsText(summary)}. Все текущие данные будут заменены данными из файла.`,
          confirmLabel: 'Восстановить',
          destructive: true,
        });
        if (!ok) return;
      }
      await importAllData(json);
      // The data on this device is now exactly the file the user keeps: no reason to ask for a backup right away.
      markBackupDone();
      toast(summary.accounts > 0 ? `Восстановлено: ${countsText(summary)}` : 'Бэкап восстановлен');
      onRestored?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось восстановить бэкап', 'error');
    } finally {
      busy.current = false;
      setRestoring(false);
    }
  };

  return {
    restoring,
    open: () => inputRef.current?.click(),
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: '.json,application/json',
      onChange,
      className: 'hidden',
      tabIndex: -1,
      'aria-hidden': true,
    } as const,
  };
}
