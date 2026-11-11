import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PEEK,
  easeInOutCubic,
  restingScrollTop,
  scrollDuration,
  smoothScrollTo,
} from '@/lib/smooth-scroll';

describe('restingScrollTop', () => {
  const base = { scrollTop: 0, scrollerTop: 64, scrollHeight: 3000, clientHeight: 700 };

  it('brings the target to rest a peek below the scroller top', () => {
    // Target 900 px below the scroller's top edge → scroll by 900 minus the peek.
    expect(restingScrollTop({ ...base, targetTop: 64 + 900 })).toBe(900 - DEFAULT_PEEK);
  });

  it('counts what is already scrolled', () => {
    expect(restingScrollTop({ ...base, scrollTop: 200, targetTop: 64 + 700 }, 60)).toBe(840);
  });

  it('stays within what the scroller can reach', () => {
    expect(restingScrollTop({ ...base, targetTop: 64 + 5000 })).toBe(2300);
    expect(restingScrollTop({ ...base, targetTop: 64 + 10 })).toBe(0);
  });
});

describe('scrollDuration', () => {
  it('is quick but never a cut, and never drags', () => {
    expect(scrollDuration(50)).toBe(400);
    expect(scrollDuration(600)).toBe(500);
    expect(scrollDuration(-600)).toBe(500);
    expect(scrollDuration(5000)).toBe(700);
  });
});

describe('easeInOutCubic', () => {
  it('starts and ends at rest', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.1)).toBeLessThan(0.1);
    expect(easeInOutCubic(0.9)).toBeGreaterThan(0.9);
  });
});

describe('smoothScrollTo', () => {
  let frames: FrameRequestCallback[];
  let reduced: boolean;

  const runFrame = (time: number) => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(time));
  };

  beforeEach(() => {
    frames = [];
    reduced = false;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: reduced && query.includes('reduce') }) as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('eases to the target over the computed duration', () => {
    const el = document.createElement('main');
    smoothScrollTo(el, 600);
    runFrame(1000); // first frame fixes the start
    expect(el.scrollTop).toBe(0);
    runFrame(1250); // halfway through 500 ms
    expect(el.scrollTop).toBeCloseTo(300, 0);
    runFrame(1500);
    expect(el.scrollTop).toBe(600);
    expect(frames).toHaveLength(0);
  });

  it('jumps straight there with reduced motion', () => {
    reduced = true;
    const el = document.createElement('main');
    smoothScrollTo(el, 600);
    expect(el.scrollTop).toBe(600);
    expect(frames).toHaveLength(0);
  });

  it('stops where it is when the user touches the page', () => {
    const el = document.createElement('main');
    smoothScrollTo(el, 600);
    runFrame(1000);
    runFrame(1250);
    const reached = el.scrollTop;
    el.dispatchEvent(new Event('touchstart'));
    runFrame(1500);
    expect(el.scrollTop).toBe(reached);
  });

  it('can be stopped by the caller', () => {
    const el = document.createElement('main');
    const stop = smoothScrollTo(el, 600);
    runFrame(1000);
    stop();
    runFrame(1500);
    expect(el.scrollTop).toBe(0);
  });
});
