/**
 * localStorage that never throws. Reading it can fail outright — site data blocked in the browser
 * settings, some private modes, a full quota on write — and a preference is never worth a crash:
 * a failed read is "nothing stored", a failed write is dropped.
 */
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Pass null to remove the key. */
export function writeStorage(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the value is simply not remembered */
  }
}
