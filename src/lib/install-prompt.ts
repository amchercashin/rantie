/**
 * The browser's own "install app" dialog (Chrome and other Chromium browsers on Android).
 * The browser fires `beforeinstallprompt` once, soon after the page loads — usually before the
 * lazily loaded main page has mounted — so the event is caught at startup (main.tsx) and kept
 * here until the user asks to install. Safari has no such event: on iOS the app shows a guide.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function set(event: BeforeInstallPromptEvent | null): void {
  deferred = event;
  listeners.forEach((listener) => listener());
}

/** Call once at startup. */
export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // no browser banner of its own: the app offers the install in its place
    set(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => set(null));
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while the browser is ready to show its install dialog. */
export function canPromptInstall(): boolean {
  return deferred != null;
}

/**
 * Shows the install dialog and tells what the user chose; null when the browser has not offered
 * one. The browser allows one dialog per event, so it is spent either way.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | null> {
  const event = deferred;
  if (!event) return null;
  set(null);
  await event.prompt();
  return (await event.userChoice).outcome;
}
