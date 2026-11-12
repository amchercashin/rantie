import type { ReactNode } from 'react';
import { guideElementId, type GuideSectionId } from '@/lib/guide';
import { scrollToWithPeek } from '@/lib/smooth-scroll';
import { cn } from '@/lib/utils';

/** Building blocks of the guide's text: short paragraphs, lists and worked examples. */

/** The first line of a section: the answer in one sentence, before the details. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-[length:var(--hi-text-heading)] leading-snug text-[var(--hi-text)]">{children}</p>;
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]', className)}>{children}</p>;
}

/** Subheading inside a section. */
export function Sub({ children }: { children: ReactNode }) {
  return <h3 className="pt-3 text-[length:var(--hi-text-body)] font-semibold leading-snug text-[var(--hi-text)]">{children}</h3>;
}

export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="space-y-2">{children}</ul>;
}

export function Item({ children }: { children: ReactNode }) {
  return (
    <li className="relative pl-4 text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]">
      <span aria-hidden="true" className="absolute left-0 top-[0.62em] size-1.5 rounded-full bg-[var(--hi-gold-deep)]" />
      {children}
    </li>
  );
}

/** A formula in words. */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-[var(--hi-line)] bg-[var(--hi-raised)] px-3.5 py-2.5 text-[length:var(--hi-text-caption)] font-medium leading-relaxed text-[var(--hi-text)]">
      {children}
    </p>
  );
}

/** Rows of «what → where from / what it means». */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="overflow-hidden rounded-[18px] border border-[var(--hi-line)] bg-[var(--hi-surface)]">{children}</dl>;
}

export function Fact({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="relative px-4 py-3 after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden">
      <dt className="text-[length:var(--hi-text-body)] font-semibold leading-snug text-[var(--hi-text)]">{term}</dt>
      <dd className="mt-0.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]">{children}</dd>
    </div>
  );
}

interface ExampleProps {
  title: string;
  children: ReactNode;
}

/** A worked example laid out like a calculation slip: factors one per line, result at the bottom. */
export function Example({ title, children }: ExampleProps) {
  return (
    <figure className="rounded-[18px] border border-[rgba(217,192,142,0.22)] bg-[linear-gradient(160deg,rgba(217,192,142,0.07),rgba(217,192,142,0.015))] px-4 pb-3.5 pt-3">
      <figcaption className="text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-gold)]">{title}</figcaption>
      <div className="mt-2 space-y-1">{children}</div>
    </figure>
  );
}

/** One line of an example. `op` is the arithmetic sign in the left column (×, ÷, +). */
export function Step({ op, label, value }: { op?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[1.1rem_1fr_auto] items-baseline gap-x-2 text-[length:var(--hi-text-caption)]">
      <span aria-hidden={op ? undefined : true} className="text-center font-semibold text-[var(--hi-gold)]">{op}</span>
      <span className="min-w-0 text-[var(--hi-text-2)]">{label}</span>
      <span className="text-right font-semibold text-[var(--hi-text)]">{value}</span>
    </div>
  );
}

export function Result({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="mt-2 grid grid-cols-[1.1rem_1fr_auto] items-baseline gap-x-2 border-t border-dashed border-[rgba(217,192,142,0.3)] pt-2.5">
      <span className="text-center font-semibold text-[var(--hi-gold)]">=</span>
      <span className="min-w-0 text-[length:var(--hi-text-caption)] text-[var(--hi-text)]">{label}</span>
      <span className="text-right font-serif text-[26px] leading-none text-[var(--hi-gold-bright)]">{value}</span>
    </div>
  );
}

/** Calendar captions as they look in the app, each with its meaning. */
export function Captions({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5">{children}</div>;
}

export function Caption({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="w-fit rounded-full bg-[var(--hi-gold-tint)] px-2.5 py-0.5 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-gold)]">
        {label}
      </span>
      <span className="text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]">{children}</span>
    </div>
  );
}

/** Link to another section of the guide: scrolls the page there. */
export function Ref({ to, children }: { to: GuideSectionId; children: ReactNode }) {
  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        const target = document.getElementById(guideElementId(to));
        if (!target) return;
        e.preventDefault();
        scrollToWithPeek(target, 16);
      }}
      className="font-semibold text-[var(--hi-gold)] underline decoration-[rgba(217,192,142,0.35)] underline-offset-[3px]"
    >
      {children}
    </a>
  );
}
