import { flushSync } from 'react-dom';

/**
 * forward — push deeper (slide in from the right)
 * back    — pop back (slide in from the left)
 * tab     — switch between top-level sections (soft crossfade)
 */
export type NavDirection = 'forward' | 'back' | 'tab';

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Wrap a navigation callback in a View Transition when the API is available.
 * flushSync makes React commit synchronously inside startViewTransition so the
 * API captures correct before/after snapshots. The direction is exposed to CSS
 * via <html data-nav="…">.
 */
export function withViewTransition(cb: () => void, direction: NavDirection = 'forward'): void {
  const doc = document as ViewTransitionDocument;
  if (!doc.startViewTransition || prefersReducedMotion()) {
    cb();
    return;
  }
  const root = document.documentElement;
  root.dataset.nav = direction;
  const transition = doc.startViewTransition(() => {
    flushSync(cb);
  });
  transition.finished.finally(() => {
    if (root.dataset.nav === direction) delete root.dataset.nav;
  });
}
