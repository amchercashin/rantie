import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  autoRequestProtectionOnce,
  describeStorageStatus,
  getProtectionState,
  requestProtection,
} from '@/lib/storage-protection';

const realStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

function mockStorage(opts: { persisted: boolean; grant?: boolean } | null) {
  const persist = vi.fn(async () => opts?.grant ?? false);
  const persisted = vi.fn(async () => opts?.persisted ?? false);
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: opts === null ? undefined : { persist, persisted },
  });
  return { persist, persisted };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  if (realStorage) Object.defineProperty(navigator, 'storage', realStorage);
  else delete (navigator as unknown as { storage?: unknown }).storage;
});

describe('getProtectionState / requestProtection', () => {
  it('reports unsupported when the browser has no StorageManager', async () => {
    mockStorage(null);
    expect(await getProtectionState()).toBe('unsupported');
    expect(await requestProtection()).toBe('unsupported');
  });

  it('reads the persisted flag', async () => {
    mockStorage({ persisted: true });
    expect(await getProtectionState()).toBe('protected');
    mockStorage({ persisted: false });
    expect(await getProtectionState()).toBe('not-protected');
  });

  it('does not ask again when already protected', async () => {
    const { persist } = mockStorage({ persisted: true });
    expect(await requestProtection()).toBe('protected');
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns the browser decision', async () => {
    mockStorage({ persisted: false, grant: true });
    expect(await requestProtection()).toBe('protected');
    mockStorage({ persisted: false, grant: false });
    expect(await requestProtection()).toBe('not-protected');
  });
});

describe('autoRequestProtectionOnce', () => {
  it('asks the browser only once on its own', async () => {
    const { persist } = mockStorage({ persisted: false, grant: false });
    await autoRequestProtectionOnce();
    await autoRequestProtectionOnce();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('skips the request when data is already protected', async () => {
    const { persist } = mockStorage({ persisted: true });
    expect(await autoRequestProtectionOnce()).toBe('protected');
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('describeStorageStatus', () => {
  it('always says where the data lives', () => {
    for (const state of ['protected', 'not-protected', 'unsupported'] as const) {
      expect(describeStorageStatus({ state, platform: 'desktop', standalone: false }).title).toBe(
        'Хранятся в этом браузере на этом устройстве',
      );
    }
  });

  it('is calm when protected, and does not offer a pointless tap', () => {
    const s = describeStorageStatus({ state: 'protected', platform: 'android', standalone: true });
    expect(s.tone).toBe('ok');
    expect(s.canRequest).toBe(false);
    expect(s.detail).toMatch(/включена/);
  });

  it('offers to ask for protection when it is off', () => {
    const s = describeStorageStatus({ state: 'not-protected', platform: 'desktop', standalone: false });
    expect(s.tone).toBe('warn');
    expect(s.canRequest).toBe(true);
  });

  it('warns iPhone users in Safari about the weekly cleanup and points to the Home Screen', () => {
    const s = describeStorageStatus({ state: 'protected', platform: 'ios', standalone: false });
    expect(s.tone).toBe('warn');
    expect(s.detail).toMatch(/экран «Домой»/);
  });

  it('does not nag iPhone users who opened the app from the Home Screen', () => {
    const s = describeStorageStatus({ state: 'protected', platform: 'ios', standalone: true });
    expect(s.tone).toBe('ok');
  });

  it('falls back to "keep a backup" when the browser cannot tell', () => {
    const s = describeStorageStatus({ state: 'unsupported', platform: 'desktop', standalone: false });
    expect(s.canRequest).toBe(false);
    expect(s.detail).toMatch(/бэкап/);
  });
});
