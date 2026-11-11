/**
 * Persistence for one-off UI hints and the welcome flow.
 * localStorage may be unavailable (private mode) — every access is guarded, and hints then
 * simply show again next time.
 */
import { readStorage as read, writeStorage as write } from '@/lib/safe-storage';

const HINT_PREFIX = 'rt-hint-';
export const WELCOME_DONE_KEY = 'rt-welcome-done';
/** Key used by the previous onboarding; users who finished it skip the new welcome. */
const LEGACY_ONBOARDING_KEY = 'hi-onboarding-done';

export function isHintDismissed(id: string): boolean {
  return read(HINT_PREFIX + id) != null;
}

export function dismissHint(id: string): void {
  write(HINT_PREFIX + id, '1');
}

export function isWelcomeDone(): boolean {
  return read(WELCOME_DONE_KEY) != null || read(LEGACY_ONBOARDING_KEY) != null;
}

export function markWelcomeDone(): void {
  write(WELCOME_DONE_KEY, '1');
}

/** Bring back the welcome flow and every dismissed hint. */
export function resetHints(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(HINT_PREFIX) || key.startsWith('hi-tip-'))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
  write(WELCOME_DONE_KEY, null);
  write(LEGACY_ONBOARDING_KEY, null);
}
