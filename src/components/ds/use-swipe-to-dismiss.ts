import { useCallback, useEffect, useRef } from 'react';

/** Finger travel (px) before a touch is read as a drag in one direction. */
const SLOP = 8;
/** Pull this far (px, or this share of the sheet's height if smaller) and the sheet closes on release. */
const DISMISS_DISTANCE_MAX = 120;
const DISMISS_DISTANCE_RATIO = 0.25;
/** A flick at this speed (px/ms) closes the sheet even when the pull was short… */
const FLICK_VELOCITY = 0.5;
/** …as long as it moved at least this far (px). */
const FLICK_MIN_DISTANCE = 32;
/** Only the last stretch of the drag (ms) counts toward the release speed. */
const VELOCITY_WINDOW = 100;
const SETTLE_MS = 260;

/** Where a drag may not start: text editing, pickers, and anything opted out explicitly. */
const NO_DRAG_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-sheet-no-drag]';

interface Sample {
  y: number;
  t: number;
}

/** Should a release at this pull distance (px) and downward speed (px/ms) close a sheet of this height? */
export function shouldDismissSheet({ offset, velocity, height }: { offset: number; velocity: number; height: number }): boolean {
  if (offset <= 0) return false;
  if (offset >= Math.min(DISMISS_DISTANCE_MAX, height * DISMISS_DISTANCE_RATIO)) return true;
  return velocity >= FLICK_VELOCITY && offset >= FLICK_MIN_DISTANCE;
}

/** Downward speed (px/ms) over the last moments of a drag; 0 if the finger rested before letting go. */
export function releaseVelocity(samples: readonly Sample[], releasedAt: number): number {
  const last = samples[samples.length - 1];
  if (!last || releasedAt - last.t > VELOCITY_WINDOW) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW) ?? last;
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/**
 * May a downward drag that starts on `target` move the sheet? Not from a text field or picker,
 * and not while the content under the finger is scrolled down — then the drag scrolls it back up.
 */
export function canStartSheetDrag(target: EventTarget | null, sheet: Element): boolean {
  if (!(target instanceof Element) || !sheet.contains(target)) return false;
  if (target.closest(NO_DRAG_SELECTOR)) return false;
  for (let el: Element | null = target; el; el = el === sheet ? null : el.parentElement) {
    if (el.scrollTop > 0) return false;
  }
  return true;
}

interface Gesture {
  x0: number;
  y0: number;
  dragging: boolean;
  offset: number;
  height: number;
  samples: Sample[];
}

/**
 * Swipe down to close a bottom sheet, on touch screens. Pass `sheetRef` to the sheet and
 * `overlayRef` to its backdrop. The sheet follows the finger (CSS `translate`, so it composes with
 * the open/close `transform` animations) and on release either closes via `onDismiss` — the same
 * path as the close button — or springs back. Native listeners: `touchmove` must be non-passive
 * to stop the page from scrolling while the sheet is dragged.
 */
export function useSwipeToDismiss(onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  const overlayRef = useRef<HTMLDivElement>(null);

  const sheetRef = useCallback((sheet: HTMLDivElement | null) => {
    if (!sheet) return;
    let gesture: Gesture | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const show = (offset: number, height: number) => {
      sheet.style.setProperty('translate', `0 ${offset}px`);
      overlayRef.current?.style.setProperty('opacity', String(Math.max(0, 1 - offset / height)));
    };

    const settle = () => {
      const overlay = overlayRef.current;
      sheet.style.setProperty('transition', `translate ${SETTLE_MS}ms var(--hi-ease-out)`);
      overlay?.style.setProperty('transition', `opacity ${SETTLE_MS}ms var(--hi-ease-out)`);
      sheet.style.setProperty('translate', '0px 0px');
      overlay?.style.setProperty('opacity', '1');
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        for (const prop of ['transition', 'translate']) sheet.style.removeProperty(prop);
        for (const prop of ['transition', 'opacity']) overlay?.style.removeProperty(prop);
      }, SETTLE_MS + 40);
    };

    const dismiss = () => {
      // Lets the closing animation pick up the pace of the swipe instead of easing in from rest.
      sheet.setAttribute('data-swipe-dismiss', '');
      onDismissRef.current();
      requestAnimationFrame(() => {
        // The owner chose to keep the sheet open: put it back.
        if (sheet.getAttribute('data-state') === 'open') {
          sheet.removeAttribute('data-swipe-dismiss');
          settle();
        }
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // A second finger (pinch zoom) ends the drag.
        if (gesture?.dragging) settle();
        gesture = null;
        return;
      }
      gesture = null;
      if (sheet.getAttribute('data-state') !== 'open' || !canStartSheetDrag(e.target, sheet)) return;
      const t = e.touches[0];
      gesture = { x0: t.clientX, y0: t.clientY, dragging: false, offset: 0, height: 0, samples: [] };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture;
      if (!g || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!g.dragging) {
        const dx = t.clientX - g.x0;
        const dy = t.clientY - g.y0;
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (dy <= Math.abs(dx)) {
          // Upward or sideways: a scroll, not a dismissal.
          gesture = null;
          return;
        }
        g.dragging = true;
        g.y0 = t.clientY;
        g.height = sheet.getBoundingClientRect().height || window.innerHeight;
        clearTimeout(settleTimer);
        sheet.style.setProperty('transition', 'none');
        overlayRef.current?.style.setProperty('transition', 'none');
      }
      if (e.cancelable) e.preventDefault();
      g.offset = Math.max(0, t.clientY - g.y0);
      g.samples.push({ y: t.clientY, t: e.timeStamp });
      if (g.samples.length > 12) g.samples.shift();
      show(g.offset, g.height);
    };

    const onTouchEnd = (e: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (!g?.dragging) return;
      // A drag is not a tap: don't let it click the button it started on.
      if (e.cancelable) e.preventDefault();
      const velocity = releaseVelocity(g.samples, e.timeStamp);
      if (shouldDismissSheet({ offset: g.offset, velocity, height: g.height })) dismiss();
      else settle();
    };

    const onTouchCancel = () => {
      const g = gesture;
      gesture = null;
      if (g?.dragging) settle();
    };

    sheet.addEventListener('touchstart', onTouchStart, { passive: true });
    sheet.addEventListener('touchmove', onTouchMove, { passive: false });
    sheet.addEventListener('touchend', onTouchEnd, { passive: false });
    sheet.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      clearTimeout(settleTimer);
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      sheet.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  return { sheetRef, overlayRef };
}
