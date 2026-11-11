import { exportAllData } from '@/services/backup';
import { markBackupDone } from '@/lib/backup-reminder';

/** Saves every table as a JSON file and remembers when the user last did it. */
export async function downloadBackup(): Promise<void> {
  const json = await exportAllData();
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rantie-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // Safari starts the download asynchronously: revoking the URL right away can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markBackupDone();
}
