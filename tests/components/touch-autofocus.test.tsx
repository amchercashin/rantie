import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { TextInput } from '@/components/ds/field';
import { AddPaymentForm } from '@/components/payments/add-payment-form';

/**
 * On a phone a focused field pops up the keyboard over half the screen, so a sheet or form that
 * focuses its field on open hides itself before the user has read it. Fields are focused on their
 * own only with a mouse; on touch screens the keyboard waits for a tap.
 */

function primaryPointer(kind: 'coarse' | 'fine') {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === `(pointer: ${kind})`,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function Sheet({ field = true }: { field?: boolean }) {
  return (
    <BottomSheet open onOpenChange={() => {}} title="Цель по доходу" description="Сколько нужно в месяц">
      {field ? <TextInput aria-label="Сумма" autoFocus suffix="₽" /> : <p>Только текст</p>}
    </BottomSheet>
  );
}

describe('TextInput autoFocus', () => {
  it('focuses the field with a mouse', () => {
    primaryPointer('fine');
    render(<TextInput aria-label="Сумма" autoFocus />);
    expect(screen.getByLabelText('Сумма')).toHaveFocus();
  });

  it('leaves the field alone on a touch screen', () => {
    primaryPointer('coarse');
    render(<TextInput aria-label="Сумма" autoFocus suffix="₽" />);
    expect(screen.getByLabelText('Сумма')).not.toHaveFocus();
  });
});

describe('BottomSheet focus on open', () => {
  it('on a touch screen focuses the sheet itself — not the field, not ✕', () => {
    primaryPointer('coarse');
    render(<Sheet />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(screen.getByLabelText('Сумма')).not.toHaveFocus();
  });

  it('on a touch screen focuses the sheet even when it has no field', () => {
    primaryPointer('coarse');
    render(<Sheet field={false} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Закрыть' })).not.toHaveFocus();
  });

  it('with a mouse focuses the field marked autoFocus', () => {
    primaryPointer('fine');
    render(<Sheet />);
    expect(screen.getByLabelText('Сумма')).toHaveFocus();
  });
});

describe('AddPaymentForm', () => {
  const props = { assetId: 1, paymentType: 'dividend' as const, currency: 'RUB', onAdd: () => {}, onCancel: () => {} };

  it('does not focus the amount on a touch screen', () => {
    primaryPointer('coarse');
    render(<AddPaymentForm {...props} />);
    expect(screen.getByPlaceholderText('До НДФЛ')).not.toHaveFocus();
  });

  it('focuses the amount with a mouse', () => {
    primaryPointer('fine');
    render(<AddPaymentForm {...props} />);
    expect(screen.getByPlaceholderText('До НДФЛ')).toHaveFocus();
  });
});

/**
 * `TextInput`/`TextArea` gate `autoFocus` themselves; a raw <input autoFocus> would pop the keyboard
 * on a phone again. A raw control may only pass a computed value (`autoFocus={!isTouchPrimary()}`).
 */
const SRC = join(__dirname, '../../src');
const SKIP_DIRS = [join(SRC, 'components/ui')];
const RAW_CONTROLS = new Set(['input', 'textarea', 'select']);

function tsxFiles(dir: string): string[] {
  if (SKIP_DIRS.includes(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith('.tsx') ? [path] : [];
  });
}

function rawAutoFocus(name: string, text: string): string[] {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && RAW_CONTROLS.has(node.tagName.getText(sf))) {
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a) || a.name.getText(sf) !== 'autoFocus') continue;
        const init = a.initializer;
        const always = !init || (ts.isJsxExpression(init) && init.expression?.kind === ts.SyntaxKind.TrueKeyword);
        if (always) found.push(`${name}:${sf.getLineAndCharacterOfPosition(a.getStart(sf)).line + 1}`);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return found;
}

describe('raw form controls do not autofocus unconditionally', () => {
  it('flags bare and {true} autoFocus on raw controls only', () => {
    const probe = [
      'export const A = () => <input autoFocus />;',
      'export const B = () => <textarea autoFocus={true} />;',
      'export const C = () => <input autoFocus={!isTouchPrimary()} />;',
      'export const D = () => <TextInput autoFocus />;',
    ].join('\n');
    expect(rawAutoFocus('probe.tsx', probe)).toEqual(['probe.tsx:1', 'probe.tsx:2']);
  });

  it('none in src/', () => {
    const offenders = tsxFiles(SRC).flatMap((f) => rawAutoFocus(relative(SRC, f), readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
