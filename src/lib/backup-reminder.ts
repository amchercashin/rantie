/**
 * When to nudge the user to download a backup.
 * Data lives only in this browser, so a lost phone or cleared site data means a lost portfolio.
 * localStorage may be unavailable (private mode) — every access is guarded.
 */
import { plural } from '@/lib/utils';
import { readStorage, writeStorage } from '@/lib/safe-storage';

const LAST_BACKUP_KEY = 'rt-last-backup';
const SNOOZE_KEY = 'rt-backup-snooze';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Without any backup, wait this long after the first own account before nudging. */
export const FIRST_REMINDER_DAYS = 3;
/** After a backup, nudge again once it is this old. */
export const REPEAT_REMINDER_DAYS = 30;
/** "Later" hides the nudge for this long. */
export const SNOOZE_DAYS = 14;

function readDate(key: string): Date | null {
  const raw = readStorage(key);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** When storage is unavailable the date is not kept and the reminder simply shows again. */
function writeDate(key: string, date: Date): void {
  writeStorage(key, date.toISOString());
}

export function getLastBackupAt(): Date | null {
  return readDate(LAST_BACKUP_KEY);
}

export function markBackupDone(now = new Date()): void {
  writeDate(LAST_BACKUP_KEY, now);
}

export function snoozeBackupReminder(now = new Date()): void {
  writeDate(SNOOZE_KEY, now);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export interface BackupReminderInput {
  /** Creation date of the oldest account the user made themselves (demo excluded); null if none. */
  oldestOwnAccountAt: Date | null;
  lastBackupAt: Date | null;
  snoozedAt: Date | null;
  now: Date;
}

/** Pure decision, so it can be tested without storage. */
export function shouldRemindBackup({ oldestOwnAccountAt, lastBackupAt, snoozedAt, now }: BackupReminderInput): boolean {
  if (!oldestOwnAccountAt) return false;
  if (snoozedAt && daysBetween(snoozedAt, now) < SNOOZE_DAYS) return false;
  if (lastBackupAt) return daysBetween(lastBackupAt, now) >= REPEAT_REMINDER_DAYS;
  return daysBetween(oldestOwnAccountAt, now) >= FIRST_REMINDER_DAYS;
}

export function needsBackupReminder(oldestOwnAccountAt: Date | null, now = new Date()): boolean {
  return shouldRemindBackup({
    oldestOwnAccountAt,
    lastBackupAt: getLastBackupAt(),
    snoozedAt: readDate(SNOOZE_KEY),
    now,
  });
}

/** "сегодня", "вчера", "5 дней назад" — for the settings row. */
export function formatBackupAge(lastBackupAt: Date | null, now = new Date()): string {
  if (!lastBackupAt) return 'ещё ни разу';
  const days = daysBetween(lastBackupAt, now);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
}
