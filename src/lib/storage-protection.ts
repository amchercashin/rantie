/**
 * Whether the browser may wipe the portfolio on its own.
 * IndexedDB is "best effort" by default: the browser can evict it when the device runs low on space,
 * and Safari on iOS may delete a site's data after about a week without visits unless the app was
 * added to the Home Screen. `navigator.storage.persist()` asks the browser to keep the data;
 * Chromium and Safari decide silently, Firefox may ask the user.
 */
import type { Platform } from '@/hooks/use-install-prompt';

export type ProtectionState = 'protected' | 'not-protected' | 'unsupported';

const ASKED_KEY = 'rt-persist-asked';

function storageManager(): StorageManager | null {
  if (typeof navigator === 'undefined') return null;
  const s = navigator.storage;
  return s && typeof s.persisted === 'function' && typeof s.persist === 'function' ? s : null;
}

export async function getProtectionState(): Promise<ProtectionState> {
  const s = storageManager();
  if (!s) return 'unsupported';
  try {
    return (await s.persisted()) ? 'protected' : 'not-protected';
  } catch {
    return 'unsupported';
  }
}

export async function requestProtection(): Promise<ProtectionState> {
  const s = storageManager();
  if (!s) return 'unsupported';
  try {
    if (await s.persisted()) return 'protected';
    return (await s.persist()) ? 'protected' : 'not-protected';
  } catch {
    return 'unsupported';
  }
}

/**
 * Ask once, as soon as there is own data worth keeping. Later attempts come only from the user
 * (the settings row), so Firefox never shows its permission prompt more than once on its own.
 */
export async function autoRequestProtectionOnce(): Promise<ProtectionState> {
  const s = storageManager();
  if (!s) return 'unsupported';
  try {
    if (await s.persisted()) return 'protected';
    if (localStorage.getItem(ASKED_KEY)) return 'not-protected';
    localStorage.setItem(ASKED_KEY, new Date().toISOString());
  } catch {
    // localStorage unavailable (private mode): still try once per session
  }
  return requestProtection();
}

export interface StorageStatusInput {
  state: ProtectionState;
  platform: Platform;
  /** Opened from the Home Screen / as an installed app. */
  standalone: boolean;
}

export interface StorageStatus {
  tone: 'ok' | 'warn';
  title: string;
  detail: string;
  /** A tap on the row may ask the browser for protection. */
  canRequest: boolean;
}

/** Plain-language status for the settings screen. Pure, so it is tested without a browser. */
export function describeStorageStatus({ state, platform, standalone }: StorageStatusInput): StorageStatus {
  const title = 'Хранятся в этом браузере на этом устройстве';

  if (platform === 'ios' && !standalone) {
    return {
      tone: 'warn',
      title,
      detail:
        'Safari может стереть данные сайта, если не открывать его около недели. Добавьте Рантье на экран «Домой» — так данные хранятся надёжнее — и держите свежий бэкап.',
      canRequest: state === 'not-protected',
    };
  }

  if (state === 'protected') {
    return {
      tone: 'ok',
      title,
      detail: 'Защита от очистки включена: браузер не будет удалять их сам, чтобы освободить место. От потери телефона спасает только бэкап.',
      canRequest: false,
    };
  }

  if (state === 'not-protected') {
    return {
      tone: 'warn',
      title,
      detail: 'Защита от очистки не включена: браузер может удалить данные, если на устройстве кончится место. Нажмите, чтобы попросить защиту.',
      canRequest: true,
    };
  }

  return {
    tone: 'warn',
    title,
    detail: 'Браузер не сообщает, защищены ли данные от очистки. Надёжнее всего — свежий бэкап.',
    canRequest: false,
  };
}
