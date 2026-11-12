import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { migrateDbName } from './db/migrate-db-name';
import { migrateNdflToAccounts } from './services/app-settings';
import { listenForInstallPrompt } from './lib/install-prompt';
import App from './App';
import './index.css';

// Cleanup: unregister any SW that was previously registered at wrong scope for this app
// (other apps' SWs at their own scopes are fine — don't touch them)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      const scope = new URL(reg.scope).pathname;
      // The app's own worker lives at BASE_URL — it stays even when the app is served from "/".
      if (scope === import.meta.env.BASE_URL) continue;
      if (scope === '/' || scope === '/way' || scope === '/heroincome' || scope === '/heroincome/') {
        // Root-scope SW, missing trailing slash, or the pre-rename deploy path — leftovers from old deploys
        reg.unregister();
      }
    }
  });
}

// Android offers the install once, right after the page loads — before the main page mounts.
listenForInstallPrompt();

const SPLASH_STORAGE_KEY = 'rt-splash-seen-v2';
const SPLASH_DURATION_MS = 1900;

// Splash: the animation itself is pure CSS in index.html. Show it once per brand
// version, then keep subsequent starts instant.
function runSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  let seen = false;
  try {
    seen = !!localStorage.getItem(SPLASH_STORAGE_KEY);
    localStorage.setItem(SPLASH_STORAGE_KEY, '1');
  } catch {
    seen = true;
  }
  if (seen) {
    splash.remove();
    return;
  }

  setTimeout(() => {
    splash.classList.add('s-out');
    setTimeout(() => splash.remove(), 600);
  }, SPLASH_DURATION_MS);
}

// Migrate old DB name before React mounts. The app starts whatever the outcome: listing the
// databases can fail on its own (IndexedDB blocked or broken), and a blank page under the splash
// would hide the real error from the error boundary.
migrateDbName()
  .catch((err) => console.error('DB name migration check failed:', err))
  // NDFL rates moved from categories to accounts: carry over what the user had set.
  .then(() => migrateNdflToAccounts().catch((err) => console.error('NDFL rates migration failed:', err)))
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
    runSplash();
  });
