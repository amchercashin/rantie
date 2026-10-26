import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useDemoAccountId } from '@/hooks/use-demo';
import { needsBackupReminder, snoozeBackupReminder } from '@/lib/backup-reminder';
import { downloadBackup } from '@/lib/download-backup';
import { autoRequestProtectionOnce } from '@/lib/storage-protection';

/** Whether to show the "save a backup" nudge, plus its two actions. */
export function useBackupReminder() {
  const demoAccountId = useDemoAccountId();
  // Bumped after an action so the decision is re-read from storage.
  const [version, setVersion] = useState(0);

  const oldestOwnAccountAt = useLiveQuery(async () => {
    const accounts = await db.accounts.toArray();
    const own = accounts.filter((a) => a.id !== demoAccountId);
    if (own.length === 0) return null;
    return own.reduce((min, a) => (a.createdAt < min ? a.createdAt : min), own[0].createdAt);
  }, [demoAccountId]);

  // Once the user has a portfolio of their own, ask the browser not to evict it (once, see storage-protection).
  const hasOwnData = !!oldestOwnAccountAt;
  useEffect(() => {
    if (hasOwnData) void autoRequestProtectionOnce();
  }, [hasOwnData]);

  const show = useMemo(
    () => oldestOwnAccountAt !== undefined && needsBackupReminder(oldestOwnAccountAt),
    // `version` forces a re-read of the dates kept in localStorage after download / "later".
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [oldestOwnAccountAt, version],
  );

  const download = useCallback(async () => {
    await downloadBackup();
    setVersion((v) => v + 1);
  }, []);

  const later = useCallback(() => {
    snoozeBackupReminder();
    setVersion((v) => v + 1);
  }, []);

  return { show, download, later };
}
