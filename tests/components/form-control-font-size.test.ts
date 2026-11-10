import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * iOS Safari zooms the page in when a field with font-size under 16px gets focus, and keeps the
 * zoom after the field loses it — the app then looks wider than the screen. The base CSS sets
 * 16px on inputs, but any Tailwind text-size class at a call site wins over it, so this test
 * reads every form control in src/ and fails on a className that makes its text smaller.
 */

const SRC = join(__dirname, '../../src');
/** shadcn-generated, not edited by hand and not used by the app (ui/input has `md:text-sm`). */
const SKIP_DIRS = [join(SRC, 'components/ui')];
const CONTROLS = new Set(['input', 'textarea', 'select', 'TextInput', 'TextArea', 'SelectInput']);
/** Font-size tokens from index.css that go below 16px on a narrow phone. */
const SMALL_TOKENS = new Set(['heading', 'body', 'caption', 'micro']);
/** Variants that style a pseudo-element, not the text the user types. */
const PSEUDO_VARIANTS = new Set(['placeholder', 'file']);
/** Input types iOS does not zoom into. */
const NO_TEXT_TYPES = new Set(['checkbox', 'radio', 'file', 'hidden', 'range', 'color']);

function tsxFiles(dir: string): string[] {
  if (SKIP_DIRS.includes(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(path);
    return e.name.endsWith('.tsx') ? [path] : [];
  });
}

/** Every string literal inside an expression; identifiers resolve to top-level consts of the file. */
function classStrings(expr: ts.Node, consts: Map<string, ts.Expression>, seen = new Set<string>()): string[] {
  if (ts.isStringLiteralLike(expr)) return [expr.text];
  if (ts.isTemplateExpression(expr)) {
    return [expr.head.text, ...expr.templateSpans.flatMap((s) => [...classStrings(s.expression, consts, seen), s.literal.text])];
  }
  if (ts.isIdentifier(expr)) {
    const init = consts.get(expr.text);
    if (!init || seen.has(expr.text)) return [];
    seen.add(expr.text);
    return classStrings(init, consts, seen);
  }
  const out: string[] = [];
  expr.forEachChild((child) => {
    out.push(...classStrings(child, consts, seen));
  });
  return out;
}

/** Whether a class sets the typed text under 16px (on at least some screen width). */
function smallFontClass(cls: string): boolean {
  // Variants are split on ':' outside brackets — `text-[length:var(…)]` has one inside.
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < cls.length; i++) {
    if (cls[i] === '[') depth++;
    else if (cls[i] === ']') depth--;
    else if (cls[i] === ':' && depth === 0) {
      parts.push(cls.slice(start, i));
      start = i + 1;
    }
  }
  // `!text-sm` / `text-sm!` (important) and `text-sm/6` (with line height) set the same size.
  const utility = cls
    .slice(start)
    .replace(/^!|!$/g, '')
    .replace(/\/(\[[^\]]*\]|[^[\]/]+)$/, '');
  if (parts.some((v) => PSEUDO_VARIANTS.has(v))) return false;
  if (utility === 'text-xs' || utility === 'text-sm') return true;
  const px = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(utility);
  if (px) return Number(px[1]) < 16;
  const rem = /^text-\[(\d*(?:\.\d+)?)rem\]$/.exec(utility);
  if (rem) return Number(rem[1]) * 16 < 16;
  const token = /^text-\[length:var\(--hi-text-([a-z]+)\)\]$/.exec(utility);
  if (token) return SMALL_TOKENS.has(token[1]);
  return false;
}

interface Offender {
  where: string;
  control: string;
  classes: string[];
}

function scan(file: string): Offender[] {
  return scanSource(relative(SRC, file), readFileSync(file, 'utf8'));
}

function scanSource(name: string, text: string): Offender[] {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const consts = new Map<string, ts.Expression>();
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) consts.set(d.name.text, d.initializer);
    }
  }

  const found: Offender[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      if (CONTROLS.has(tag)) {
        const attrs = new Map<string, ts.JsxAttribute>();
        for (const a of node.attributes.properties) {
          if (ts.isJsxAttribute(a)) attrs.set(a.name.getText(sf), a);
        }
        const type = attrs.get('type')?.initializer;
        const skip = type && ts.isStringLiteral(type) && NO_TEXT_TYPES.has(type.text);
        const init = attrs.get('className')?.initializer;
        if (!skip && init) {
          const classes = classStrings(init, consts)
            .flatMap((s) => s.split(/\s+/))
            .filter((c) => c && smallFontClass(c));
          if (classes.length) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            found.push({ where: `${name}:${line + 1}`, control: tag, classes });
          }
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return found;
}

describe('form controls keep a 16px font (no iOS focus zoom)', () => {
  it('flags small text classes, ignores colours and pseudo-element variants', () => {
    expect(smallFontClass('text-[14px]')).toBe(true);
    expect(smallFontClass('text-sm')).toBe(true);
    expect(smallFontClass('md:text-sm')).toBe(true);
    expect(smallFontClass('!text-sm')).toBe(true);
    expect(smallFontClass('text-xs!')).toBe(true);
    expect(smallFontClass('text-sm/6')).toBe(true);
    expect(smallFontClass('text-[13px]/[1.4]')).toBe(true);
    expect(smallFontClass('text-base/7')).toBe(false);
    expect(smallFontClass('text-[0.875rem]')).toBe(true);
    expect(smallFontClass('text-[length:var(--hi-text-heading)]')).toBe(true);
    expect(smallFontClass('text-base')).toBe(false);
    expect(smallFontClass('text-[16px]')).toBe(false);
    expect(smallFontClass('text-[length:var(--hi-text-large)]')).toBe(false);
    expect(smallFontClass('text-[var(--hi-text)]')).toBe(false);
    expect(smallFontClass('placeholder:text-sm')).toBe(false);
  });

  it('sees through cn(), consts and templates, and skips checkboxes', () => {
    const probe = [
      "const CONTROL = 'w-full text-base ' + 'md:text-sm';",
      "export const A = () => <TextArea className={cn('font-mono text-[14px]', open && 'border')} />;",
      'export const B = () => <input className={CONTROL} />;',
      'export const C = () => <select className={`h-12 ${big ? "text-lg" : "text-xs"}`} />;',
      'export const D = () => <input type="checkbox" className="text-xs" />;',
      'export const E = () => <TextInput className="text-base text-[var(--hi-text)]" />;',
    ].join('\n');
    expect(scanSource('probe.tsx', probe)).toEqual([
      { where: 'probe.tsx:2', control: 'TextArea', classes: ['text-[14px]'] },
      { where: 'probe.tsx:3', control: 'input', classes: ['md:text-sm'] },
      { where: 'probe.tsx:4', control: 'select', classes: ['text-xs'] },
    ]);
  });

  it('scans the design-system fields', () => {
    expect(tsxFiles(SRC).some((f) => f.endsWith(join('components', 'ds', 'field.tsx')))).toBe(true);
  });

  it('no input, textarea or select in src/ sets a font-size under 16px', () => {
    const offenders = tsxFiles(SRC).flatMap(scan);
    expect(offenders).toEqual([]);
  });
});
