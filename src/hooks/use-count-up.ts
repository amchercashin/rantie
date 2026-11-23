import { useState, useEffect, useRef } from 'react';

/**
 * Animates a number towards `target`. The first run counts up from zero
 * (when `animate` is true); later changes glide from the previous value.
 */
export function useCountUp(target: number | null, animate = true, duration = 1100): number | null {
  const [current, setCurrent] = useState<number | null>(animate ? null : target);
  const currentRef = useRef<number | null>(animate ? null : target);

  useEffect(() => {
    if (target == null) {
      currentRef.current = null;
      setCurrent(null);
      return;
    }
    if (currentRef.current === target) return;
    const from = currentRef.current ?? 0;
    if (from === target) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }

    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if ((!animate && currentRef.current == null) || reduced) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }

    const start = performance.now();
    const span = currentRef.current == null ? duration : duration * 0.6;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / span, 1);
      const eased = 1 - Math.pow(1 - t, 4); // ease-out quart
      const value = from + (target - from) * eased;
      currentRef.current = t < 1 ? value : target;
      setCurrent(currentRef.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, animate]);

  return current;
}
