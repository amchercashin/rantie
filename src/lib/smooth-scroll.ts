import { prefersReducedMotion } from '@/lib/view-transition';

/**
 * In-page scrolling at a pace we choose. Native `behavior: 'smooth'` leaves the speed to the
 * browser (Safari's is slow on long hops); here a jump down the page is quick, yet eased at
 * both ends so it still reads as a scroll rather than a cut.
 */

/** How much of the content above the target stays in view, so it is plainly the same page. */
export const DEFAULT_PEEK = 60;

/** Any of these on the scroller means the user has taken over: the animation stops at once. */
const TAKEOVER_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** About 0.4 s for a short hop, 0.5 s for a screen and a half, never more than 0.7 s. */
export function scrollDuration(distance: number): number {
  return Math.round(Math.min(700, Math.max(400, 320 + Math.abs(distance) * 0.3)));
}

export interface ScrollGeometry {
  /** Current scrollTop of the scroller. */
  scrollTop: number;
  /** Viewport top of the scroller's box (getBoundingClientRect().top). */
  scrollerTop: number;
  /** Viewport top of the target. */
  targetTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** scrollTop at which the target rests `peek` px below the scroller's top edge, within reach. */
export function restingScrollTop(g: ScrollGeometry, peek = DEFAULT_PEEK): number {
  const wanted = g.scrollTop + (g.targetTop - g.scrollerTop) - peek;
  const max = Math.max(0, g.scrollHeight - g.clientHeight);
  return Math.min(max, Math.max(0, Math.round(wanted)));
}

/** Animate `scroller` to `top`. Returns a function that stops the animation where it is. */
export function smoothScrollTo(scroller: HTMLElement, top: number): () => void {
  const from = scroller.scrollTop;
  const distance = top - from;
  if (Math.abs(distance) < 1 || prefersReducedMotion()) {
    scroller.scrollTop = top;
    return () => {};
  }

  const duration = scrollDuration(distance);
  let start: number | null = null;
  let raf = 0;
  let done = false;

  const stop = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    for (const type of TAKEOVER_EVENTS) scroller.removeEventListener(type, stop);
  };

  const step = (now: number) => {
    if (done) return;
    if (start == null) start = now;
    const t = Math.min(1, (now - start) / duration);
    scroller.scrollTop = from + distance * easeInOutCubic(t);
    if (t < 1) raf = requestAnimationFrame(step);
    else stop();
  };

  for (const type of TAKEOVER_EVENTS) scroller.addEventListener(type, stop, { passive: true });
  raf = requestAnimationFrame(step);
  return stop;
}

/**
 * Scroll the nearest scrolling `<main>` (AppShell) so that `target` comes to rest just under
 * the header with a strip of the content above still showing. Returns the stop function,
 * or null when there is nothing to scroll.
 */
export function scrollToWithPeek(target: HTMLElement, peek = DEFAULT_PEEK): (() => void) | null {
  const scroller = target.closest('main');
  if (!scroller) return null;
  const top = restingScrollTop(
    {
      scrollTop: scroller.scrollTop,
      scrollerTop: scroller.getBoundingClientRect().top,
      targetTop: target.getBoundingClientRect().top,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
    },
    peek,
  );
  return smoothScrollTo(scroller, top);
}
