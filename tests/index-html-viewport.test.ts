import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * index.html adds `maximum-scale=1` to the viewport on iOS only. Safari zooms the page in when a
 * field gets focus — also a 16px one when the page rests below 100% (Safari page zoom, shrink to
 * fit) — and keeps the zoom afterwards, so the app looks wider than the screen. Safari ignores
 * maximum-scale for pinch gestures, so people can still zoom; Android honours it and would lose
 * pinch zoom, so there the viewport stays as it is.
 */

const html = readFileSync(join(__dirname, '../index.html'), 'utf8');
const BASE = 'width=device-width, initial-scale=1.0, viewport-fit=cover';

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
};

function viewportScript(): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const script = scripts.find((s) => s.includes('maximum-scale=1'));
  if (!script) throw new Error('index.html has no inline viewport script');
  return script;
}

function runWith(userAgent: string, maxTouchPoints: number): string {
  document.head.innerHTML = `<meta name="viewport" content="${BASE}" />`;
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
  new Function(viewportScript())();
  return document.querySelector('meta[name="viewport"]')!.getAttribute('content')!;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('index.html viewport', () => {
  it('keeps the static viewport zoomable everywhere', () => {
    const meta = /<meta name="viewport" content="([^"]+)"/.exec(html);
    expect(meta?.[1]).toBe(BASE);
  });

  it('runs before the app loads', () => {
    expect(html.indexOf(viewportScript())).toBeLessThan(html.indexOf('/src/main.tsx'));
  });

  it('adds maximum-scale=1 on iPhone and on iPad that reports itself as a Mac', () => {
    expect(runWith(UA.iphone, 5)).toBe(`${BASE}, maximum-scale=1`);
    expect(runWith(UA.ipadDesktop, 5)).toBe(`${BASE}, maximum-scale=1`);
  });

  it('leaves Android and desktop Mac alone', () => {
    expect(runWith(UA.android, 5)).toBe(BASE);
    expect(runWith(UA.mac, 0)).toBe(BASE);
  });
});
