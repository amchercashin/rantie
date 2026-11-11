import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  getPlatform,
  getIsStandalone,
  shouldShowButton,
  shouldAutoLaunchGuide,
  useInstallPrompt,
} from '@/hooks/use-install-prompt';

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

describe('shouldShowButton', () => {
  it('shows when onboarding done, mobile, not standalone, not dismissed', () => {
    expect(shouldShowButton({
      onboardingDone: true,
      isStandalone: false,
      platform: 'ios',
      dismissedAt: null,
      visitsSinceDismiss: 0,
    })).toBe(true);
  });

  it('hides when standalone', () => {
    expect(shouldShowButton({
      onboardingDone: true,
      isStandalone: true,
      platform: 'android',
      dismissedAt: null,
      visitsSinceDismiss: 0,
    })).toBe(false);
  });

  it('hides on desktop', () => {
    expect(shouldShowButton({
      onboardingDone: true,
      isStandalone: false,
      platform: 'desktop',
      dismissedAt: null,
      visitsSinceDismiss: 0,
    })).toBe(false);
  });

  it('hides when onboarding not done', () => {
    expect(shouldShowButton({
      onboardingDone: false,
      isStandalone: false,
      platform: 'ios',
      dismissedAt: null,
      visitsSinceDismiss: 0,
    })).toBe(false);
  });

  it('hides when recently dismissed', () => {
    expect(shouldShowButton({
      onboardingDone: true,
      isStandalone: false,
      platform: 'ios',
      dismissedAt: Date.now(),
      visitsSinceDismiss: 3,
    })).toBe(false);
  });

  it('shows again after 5 visits since dismiss', () => {
    expect(shouldShowButton({
      onboardingDone: true,
      isStandalone: false,
      platform: 'ios',
      dismissedAt: Date.now() - 100000,
      visitsSinceDismiss: 5,
    })).toBe(true);
  });
});

describe('shouldAutoLaunchGuide', () => {
  it('auto-launches on iOS at 3rd visit when not seen', () => {
    expect(shouldAutoLaunchGuide({
      platform: 'ios',
      visits: 3,
      isStandalone: false,
      iosSeen: false,
    })).toBe(true);
  });

  it('does not auto-launch on Android', () => {
    expect(shouldAutoLaunchGuide({
      platform: 'android',
      visits: 3,
      isStandalone: false,
      iosSeen: false,
    })).toBe(false);
  });

  it('does not auto-launch when already seen', () => {
    expect(shouldAutoLaunchGuide({
      platform: 'ios',
      visits: 5,
      isStandalone: false,
      iosSeen: true,
    })).toBe(false);
  });

  it('does not auto-launch before 3rd visit', () => {
    expect(shouldAutoLaunchGuide({
      platform: 'ios',
      visits: 2,
      isStandalone: false,
      iosSeen: false,
    })).toBe(false);
  });
});

describe('useInstallPrompt', () => {
  const originalUA = navigator.userAgent;

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', { value: originalUA, configurable: true });
  });

  it('stays hidden until the onboarding is finished', () => {
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.showButton).toBe(false);
  });

  it('offers the install after the onboarding', () => {
    localStorage.setItem('hi-onboarding-done', '1');
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.showButton).toBe(true);
  });

  it('stays hidden after a dismissal', () => {
    localStorage.setItem('hi-onboarding-done', '1');
    const first = renderHook(() => useInstallPrompt());
    act(() => first.result.current.dismiss());
    expect(first.result.current.showButton).toBe(false);

    const next = renderHook(() => useInstallPrompt());
    expect(next.result.current.showButton).toBe(false);
  });
});
