import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Hint } from '@/components/ds/hint';
import { GuidePage } from '@/pages/guide-page';
import { GUIDE_SECTIONS, guideElementId, guidePath, sectionFromHash } from '@/lib/guide';

afterEach(() => {
  localStorage.clear();
});

function Where() {
  const { pathname, hash } = useLocation();
  return <div data-testid="where">{pathname + hash}</div>;
}

describe('guide links', () => {
  it('builds a route to a section and reads it back from the hash', () => {
    expect(guidePath()).toBe('/settings/guide');
    expect(guidePath('income')).toBe('/settings/guide#income');
    expect(sectionFromHash('#income-modes')).toBe('income-modes');
    expect(sectionFromHash('#nope')).toBeNull();
    expect(sectionFromHash('')).toBeNull();
  });
});

describe('Hint «i»', () => {
  it('opens the guide at its section', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Hint id="t-more" more="income">Текст</Hint>} />
          <Route path="/settings/guide" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: /Подробнее/ });
    expect(link).toHaveAttribute('href', '/settings/guide#income');
    fireEvent.click(link);
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/guide#income');
  });

  it('has no «i» without a section', () => {
    render(
      <MemoryRouter>
        <Hint id="t-plain">Текст</Hint>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: 'Скрыть подсказку' })).toBeInTheDocument();
  });
});

describe('GuidePage', () => {
  it('has every section; all but the summary are listed in the contents', () => {
    render(
      <MemoryRouter initialEntries={['/settings/guide#tax']}>
        <GuidePage />
      </MemoryRouter>,
    );
    const toc = screen.getByRole('navigation', { name: 'Содержание' });
    for (const s of GUIDE_SECTIONS) {
      const section = document.getElementById(guideElementId(s.id));
      expect(section, s.id).not.toBeNull();
      expect(within(section!).getByRole('heading', { level: 2 })).toHaveTextContent(s.title);
      expect(section!.textContent!.length, `${s.id} has text`).toBeGreaterThan(s.title.length + 80);
      if (s.group !== 'start') expect(within(toc).getByRole('link', { name: s.short })).toHaveAttribute('href', `#${s.id}`);
    }
  });
});

/** Every hint gets an «i»: its text is the short version, the guide has the rest. */
describe('hints link to the guide', () => {
  const root = join(__dirname, '../../src');
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.tsx') ? [join(dir, e.name)] : [],
    );

  it('each <Hint> in the app names a guide section', () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of files(root)) {
      if (file.endsWith(join('ds', 'hint.tsx'))) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<Hint\b[^>]*>/g)) {
        count++;
        if (!/\bmore=/.test(match[0])) missing.push(`${relative(root, file)}: ${match[0]}`);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
