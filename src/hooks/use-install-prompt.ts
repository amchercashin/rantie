import { useState, useEffect, useCallback, useRef } from 'react';
import { readStorage, writeStorage } from '@/lib/safe-storage';

// The `hi-` prefix is historical (the app was called HeroIncome). Renaming the keys would
// forget who has already dismissed the banner, so they stay.
const KEY_DISMISSED  = 'hi-a2hs-dismissed';
const KEY_VISITS     = 'hi-a2hs-visits';
const KEY_IOS_SEEN   = 'hi-a2hs-ios-seen';
/**
 * Written by the onboarding that the welcome flow replaced; nothing writes it any more
 * (the welcome flow keeps `rt-welcome-done`, see lib/hints.ts). So the install banner and the
 * iOS guide show only to people who finished the old onboarding. Whether to bring them back
 * for everyone is an open product decision — switching to `isWelcomeDone()` does it.
 */
const ONBOARDING_KEY = 'hi-onboarding-done';

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

export function shouldShowButton(opts: {
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

export function shouldAutoLaunchGuide(opts: {
  platform: Platform;
  visits: number;
  isStandalone: boolean;
  iosSeen: boolean;
}): boolean {
  return (
    opts.platform === 'ios' &&
    opts.visits >= 3 &&
    !opts.isStandalone &&
    !opts.iosSeen
  );
}

interface InstallPromptState {
  showButton: boolean;
  platform: Platform;
  autoLaunchGuide: boolean;
  promptInstall: () => void;
  dismiss: () => void;
  markIosSeen: () => void;
}

export function useInstallPrompt(): InstallPromptState {
  const platform = useRef(getPlatform()).current;
  const standalone = useRef(getIsStandalone()).current;
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [autoLaunch, setAutoLaunch] = useState(false);

  useEffect(() => {
    if (standalone) return;

    const onboardingDone = readStorage(ONBOARDING_KEY) === '1';
    const iosSeen = readStorage(KEY_IOS_SEEN) === '1';
    const dismissedAt = readStorage(KEY_DISMISSED);
    const dismissTs = dismissedAt ? Number(dismissedAt) : null;

    const prevVisits = Number(readStorage(KEY_VISITS) || '0');
    const visits = prevVisits + 1;
    writeStorage(KEY_VISITS, String(visits));

    const visitsSinceDismiss = dismissTs ? visits : 0;

    setShowButton(shouldShowButton({
      onboardingDone,
      isStandalone: standalone,
      platform,
      dismissedAt: dismissTs,
      visitsSinceDismiss,
    }));

    setAutoLaunch(shouldAutoLaunchGuide({
      platform,
      visits,
      isStandalone: standalone,
      iosSeen,
    }));
  }, [platform, standalone]);

  useEffect(() => {
    if (platform !== 'android') return;
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      deferredPrompt.current = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [platform]);

  const promptInstall = useCallback(() => {
    deferredPrompt.current?.prompt();
    deferredPrompt.current = null;
  }, []);

  const dismiss = useCallback(() => {
    writeStorage(KEY_DISMISSED, String(Date.now()));
    writeStorage(KEY_VISITS, '0');
    setShowButton(false);
  }, []);

  const markIosSeen = useCallback(() => {
    writeStorage(KEY_IOS_SEEN, '1');
    setAutoLaunch(false);
  }, []);

  return {
    showButton,
    platform,
    autoLaunchGuide: autoLaunch,
    promptInstall,
    dismiss,
    markIosSeen,
  };
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
