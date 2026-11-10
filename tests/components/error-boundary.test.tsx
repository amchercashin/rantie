import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, isChunkLoadError } from '@/components/error-boundary';

function Boom(): never {
  throw new TypeError("undefined is not an object (evaluating 'x.y')");
}

describe('ErrorBoundary', () => {
  it('shows the error text so a phone user can report it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Что-то пошло не так')).toBeInTheDocument();
    expect(screen.getByTestId('error-details').textContent).toContain("TypeError: undefined is not an object (evaluating 'x.y')");
    expect(screen.getByRole('button', { name: 'Сбросить кеш и перезагрузить' })).toBeInTheDocument();
  });
});

describe('isChunkLoadError', () => {
  it('recognises missing lazy chunks in Safari, Chrome and Firefox wording', () => {
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError("undefined is not an object"))).toBe(false);
  });
});
