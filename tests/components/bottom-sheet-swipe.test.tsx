import { describe, it, expect, vi } from 'vitest';
import { useState, type ReactNode } from 'react';
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { releaseVelocity, shouldDismissSheet } from '@/components/ds/use-swipe-to-dismiss';

describe('shouldDismissSheet', () => {
  it('closes after a long enough pull', () => {
    expect(shouldDismissSheet({ offset: 120, velocity: 0, height: 800 })).toBe(true);
    expect(shouldDismissSheet({ offset: 119, velocity: 0, height: 800 })).toBe(false);
  });

  it('asks a short sheet for a shorter pull', () => {
    expect(shouldDismissSheet({ offset: 60, velocity: 0, height: 240 })).toBe(true);
    expect(shouldDismissSheet({ offset: 59, velocity: 0, height: 240 })).toBe(false);
  });

  it('closes on a quick flick even when the pull was short', () => {
    expect(shouldDismissSheet({ offset: 40, velocity: 0.8, height: 800 })).toBe(true);
    expect(shouldDismissSheet({ offset: 10, velocity: 2, height: 800 })).toBe(false);
    expect(shouldDismissSheet({ offset: 40, velocity: 0.2, height: 800 })).toBe(false);
  });
});

describe('releaseVelocity', () => {
  it('measures the last stretch of the drag', () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 100, t: 200 },
      { y: 150, t: 250 },
      { y: 200, t: 300 },
    ];
    expect(releaseVelocity(samples, 300)).toBe(1); // 100 px over the last 100 ms
  });

  it('is zero when the finger rested before letting go', () => {
    expect(releaseVelocity([{ y: 0, t: 0 }, { y: 50, t: 20 }], 400)).toBe(0);
    expect(releaseVelocity([], 0)).toBe(0);
  });
});

type TouchType = 'touchStart' | 'touchMove' | 'touchEnd';

function touch(el: Element, type: TouchType, y: number, t: number, x = 100) {
  const point = { clientX: x, clientY: y, target: el };
  const event = createEvent[type](el, {
    touches: type === 'touchEnd' ? [] : [point],
    changedTouches: [point],
  });
  Object.defineProperty(event, 'timeStamp', { value: t });
  fireEvent(el, event);
  return event;
}

/** Drags from `from` to `to` (clientY) in even steps over `ms`, then lifts the finger. */
function drag(el: Element, from: number, to: number, { ms = 1000, x = 100, toX = x }: { ms?: number; x?: number; toX?: number } = {}) {
  touch(el, 'touchStart', from, 0, x);
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    touch(el, 'touchMove', from + ((to - from) * i) / steps, (ms * i) / steps, x + ((toX - x) * i) / steps);
  }
  return touch(el, 'touchEnd', to, ms, toX);
}

function Harness({ onOpenChange, children }: { onOpenChange: (open: boolean) => void; children?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        setOpen(v);
      }}
      title="Цель по доходу"
    >
      {children ?? <p>Содержимое</p>}
    </BottomSheet>
  );
}

describe('BottomSheet swipe to close', () => {
  it('closes when pulled down far enough', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    drag(screen.getByRole('heading', { name: 'Цель по доходу' }), 100, 400);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('follows the finger while dragging', () => {
    render(<Harness onOpenChange={vi.fn()} />);
    const title = screen.getByRole('heading', { name: 'Цель по доходу' });
    touch(title, 'touchStart', 100, 0);
    touch(title, 'touchMove', 110, 10); // past the slop: drag starts here
    const move = touch(title, 'touchMove', 170, 20);
    expect(move.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog').style.getPropertyValue('translate')).toBe('0 60px');
  });

  it('closes on a quick flick', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    drag(screen.getByRole('heading', { name: 'Цель по доходу' }), 100, 160, { ms: 60 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('springs back after a short, slow pull — and swallows the tap', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const end = drag(screen.getByRole('heading', { name: 'Цель по доходу' }), 100, 150);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(end.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog').style.getPropertyValue('translate')).toBe('0px 0px');
  });

  it('ignores upward and sideways swipes', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const title = screen.getByRole('heading', { name: 'Цель по доходу' });
    drag(title, 400, 100);
    drag(title, 100, 140, { x: 50, toX: 300 });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog').style.getPropertyValue('translate')).toBe('');
  });

  it('leaves a plain tap alone', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    const title = screen.getByRole('heading', { name: 'Цель по доходу' });
    touch(title, 'touchStart', 100, 0);
    const end = touch(title, 'touchEnd', 100, 80);
    expect(end.defaultPrevented).toBe(false);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not start from a text field', () => {
    const onOpenChange = vi.fn();
    render(
      <Harness onOpenChange={onOpenChange}>
        <textarea aria-label="Ответ ИИ" />
      </Harness>,
    );
    drag(screen.getByLabelText('Ответ ИИ'), 100, 500);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('scrolls content back up instead of closing while it is scrolled down', () => {
    const onOpenChange = vi.fn();
    render(
      <Harness onOpenChange={onOpenChange}>
        <p>Длинный список</p>
      </Harness>,
    );
    const item = screen.getByText('Длинный список');
    const scroller = item.parentElement!;
    act(() => {
      scroller.scrollTop = 80;
    });
    if (scroller.scrollTop !== 80) Object.defineProperty(scroller, 'scrollTop', { value: 80 });
    drag(item, 100, 500);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
