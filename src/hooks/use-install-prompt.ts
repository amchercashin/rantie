import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { isWelcomeDone } from '@/lib/hints';
import { canPromptInstall, promptInstall, subscribeInstallPrompt } from '@/lib/install-prompt';
import { readStorage, writeStorage } from '@/lib/safe-storage';

// The `hi-` prefix is historical (the app was called HeroIncome). Renaming the keys would
// forget who has already dismissed the invitation, so they stay.
const KEY_DISMISSED = 'hi-a2hs-dismissed';
const KEY_VISITS = 'hi-a2hs-visits';

const VISITS_TO_RE_SHOW = 5;

export type Platform = 'ios' | 'android' | 'desktop';

export function getPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function getIsStandalone(): boolean {
  if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

/**
 * Whether to invite the user to install the app: on a phone, in a browser tab, after the welcome
 * flow, and not within five visits of the last "no".
 */
export function shouldOfferInstall(opts: {
  onboardingDone: boolean;
  isStandalone: boolean;
  platform: Platform;
  dismissedAt: number | null;
  visitsSinceDismiss: number;
}): boolean {
  if (!opts.onboardingDone) return false;
  if (opts.isStandalone) return false;
  if (opts.platform === 'desktop') return false;
  if (opts.dismissedAt != null && opts.visitsSinceDismiss < VISITS_TO_RE_SHOW) return false;
  return true;
}

interface InstallPromptState {
  /** Show the invitation. On Android only while the browser can actually show its install dialog. */
  show: boolean;
  platform: Platform;
  /** Android: opens the browser's install dialog. */
  install: () => Promise<void>;
  dismiss: () => void;
}

export function useInstallPrompt(): InstallPromptState {
  const platform = useRef(getPlatform()).current;
  const standalone = useRef(getIsStandalone()).current;
  const [eligible, setEligible] = useState(false);
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall);

  useEffect(() => {
    if (standalone) return;

    const dismissedAt = readStorage(KEY_DISMISSED);
    const dismissTs = dismissedAt ? Number(dismissedAt) : null;

    const visits = Number(readStorage(KEY_VISITS) || '0') + 1;
    writeStorage(KEY_VISITS, String(visits));

    setEligible(shouldOfferInstall({
      onboardingDone: isWelcomeDone(),
      isStandalone: standalone,
      platform,
      dismissedAt: dismissTs,
      visitsSinceDismiss: dismissTs ? visits : 0,
    }));
  }, [platform, standalone]);

  const dismiss = useCallback(() => {
    writeStorage(KEY_DISMISSED, String(Date.now()));
    writeStorage(KEY_VISITS, '0');
    setEligible(false);
  }, []);

  const install = useCallback(async () => {
    // "Not now" in the browser's dialog is the same answer as closing the invitation.
    if ((await promptInstall()) === 'dismissed') dismiss();
  }, [dismiss]);

  return {
    show: eligible && (platform === 'ios' || canPrompt),
    platform,
    install,
    dismiss,
  };
}
