import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  getPlatform,
  getIsStandalone,
  shouldOfferInstall,
  useInstallPrompt,
} from '@/hooks/use-install-prompt';
import { listenForInstallPrompt } from '@/lib/install-prompt';
import { markWelcomeDone } from '@/lib/hints';

describe('getPlatform', () => {
  const originalUA = navigator.userAgent;
  const originalPlatform = navigator.platform;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  function mockUA(ua: string, platform?: string, touchPoints?: number) {
    Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
    if (platform != null)
      Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
    if (touchPoints != null)
      Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
  }

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
    Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
  });

  it('detects iPhone', () => {
    mockUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(getPlatform()).toBe('ios');
  });

  it('detects iPad pretending to be Mac', () => {
    mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5);
    expect(getPlatform()).toBe('ios');
  });

  it('detects Android', () => {
    mockUA('Mozilla/5.0 (Linux; Android 14; Pixel 8)');
    expect(getPlatform()).toBe('android');
  });

  it('returns desktop for Chrome on Mac', () => {
    mockUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0);
    expect(getPlatform()).toBe('desktop');
  });
});

describe('getIsStandalone', () => {
  it('returns false in normal browser', () => {
    expect(getIsStandalone()).toBe(false);
  });
});

describe('shouldOfferInstall', () => {
  const base = { onboardingDone: true, isStandalone: false, platform: 'ios' as const, dismissedAt: null, visitsSinceDismiss: 0 };

  it('offers on a phone, in a browser tab, after the onboarding', () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, platform: 'android' })).toBe(true);
  });

  it('does not offer to an installed app', () => {
    expect(shouldOfferInstall({ ...base, isStandalone: true })).toBe(false);
  });

  it('does not offer on desktop', () => {
    expect(shouldOfferInstall({ ...base, platform: 'desktop' })).toBe(false);
  });

  it('waits for the onboarding to finish', () => {
    expect(shouldOfferInstall({ ...base, onboardingDone: false })).toBe(false);
  });

  it('stays quiet for five visits after a dismissal, then offers again', () => {
    expect(shouldOfferInstall({ ...base, dismissedAt: Date.now(), visitsSinceDismiss: 2 })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: Date.now(), visitsSinceDismiss: 5 })).toBe(true);
  });
});

describe('useInstallPrompt', () => {
  const originalUA = navigator.userAgent;
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
  const setUA = (value: string) => Object.defineProperty(navigator, 'userAgent', { value, configurable: true });

  /** What Chrome on Android sends when the app can be installed. */
  function browserOffersInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => { window.dispatchEvent(event); });
    return event;
  }

  beforeAll(() => listenForInstallPrompt());

  beforeEach(() => {
    localStorage.clear();
    act(() => { window.dispatchEvent(new Event('appinstalled')); }); // forget an offer left by another test
  });

  afterEach(() => setUA(originalUA));

  it('stays hidden until the welcome flow is finished', () => {
    setUA(IPHONE);
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.show).toBe(false);
  });

  it('invites an iPhone user once the welcome flow is finished', () => {
    setUA(IPHONE);
    markWelcomeDone();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.show).toBe(true);
  });

  it('honours the key left by the previous onboarding', () => {
    setUA(IPHONE);
    localStorage.setItem('hi-onboarding-done', '1');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.show).toBe(true);
  });

  it('on Android waits until the browser can show its install dialog', () => {
    setUA(ANDROID);
    markWelcomeDone();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.show).toBe(false);

    browserOffersInstall();
    expect(result.current.show).toBe(true);
  });

  it('opens the browser dialog and hides the invitation after the install', async () => {
    setUA(ANDROID);
    markWelcomeDone();
    const event = browserOffersInstall('accepted');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.show).toBe(true);

    await act(() => result.current.install());

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(result.current.show).toBe(false);
  });

  it('treats "not now" in the browser dialog as a dismissal', async () => {
    setUA(ANDROID);
    markWelcomeDone();
    browserOffersInstall('dismissed');
    const { result } = renderHook(() => useInstallPrompt());

    await act(() => result.current.install());
    browserOffersInstall(); // the browser may offer again right away — the user has just said no

    expect(result.current.show).toBe(false);
    expect(localStorage.getItem('hi-a2hs-dismissed')).not.toBeNull();
  });

  it('stays hidden after a dismissal', () => {
    setUA(IPHONE);
    markWelcomeDone();
    const first = renderHook(() => useInstallPrompt());
    act(() => first.result.current.dismiss());
    expect(first.result.current.show).toBe(false);

    const next = renderHook(() => useInstallPrompt());
    expect(next.result.current.show).toBe(false);
  });
});
