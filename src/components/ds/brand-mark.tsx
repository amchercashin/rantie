import { useId } from 'react';
import { cn } from '@/lib/utils';

// Cormorant Garamond «Р» outline with a ruble crossbar — the Рантье monogram.
const GLYPH =
  'M186-542L186-85Q186-55 194.5-39.5Q203-24 230-18Q257-12 311-12Q314-12 314-6Q314 0 311 0Q279 0 241.5-1Q204-2 160-2Q128-2 98-1Q68 0 44 0Q42 0 42-6Q42-12 44-12Q82-12 101-17Q120-22 126.5-37Q133-52 133-81L133-544Q133-573 126.5-587.5Q120-602 101-607.5Q82-613 44-613Q42-613 42-619Q42-625 44-625Q68-625 97.5-623.5Q127-622 159-622Q185-622 222-625Q259-628 299-628Q354-628 399-611Q444-594 470.5-558Q497-522 497-464Q497-411 477-373Q457-335 424.5-310.5Q392-286 353-274Q314-262 276-262Q263-262 250.5-263Q238-264 227-267Q223-268 224.5-274.5Q226-281 229-280Q238-278 247.5-277Q257-276 265-276Q309-276 348-294Q387-312 411-349.5Q435-387 435-444Q435-499 413.5-537Q392-575 356-595Q320-615 276-615Q240-615 220.5-611.5Q201-608 193.5-593Q186-578 186-542';

export function BrandMark({ className, framed = false }: { className?: string; framed?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 512 512" className={cn('shrink-0', className)} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dfb0" />
          <stop offset="1" stopColor="#c3a164" />
        </linearGradient>
        {framed && (
          <radialGradient id={`bg${id}`} cx="50%" cy="18%" r="85%">
            <stop offset="0" stopColor="#26211a" />
            <stop offset="1" stopColor="#0b0a08" />
          </radialGradient>
        )}
      </defs>
      {framed && (
        <>
          <rect width="512" height="512" rx="112" fill={`url(#bg${id})`} />
          <rect x="1.5" y="1.5" width="509" height="509" rx="110.5" fill="none" stroke="#d9c08e" strokeOpacity="0.18" strokeWidth="3" />
        </>
      )}
      <g
        transform={framed ? 'translate(126 413) scale(0.5)' : 'translate(83.4 463.2) scale(0.66)'}
        fill={`url(#g${id})`}
        stroke={`url(#g${id})`}
        strokeWidth="10"
        strokeLinejoin="round"
      >
        <path d={GLYPH} />
        <rect x="28" y="-196" width="300" height="20" rx="4" />
      </g>
    </svg>
  );
}

/**
 * The wordmark's first letter: the same Cormorant «Р» with a ruble crossbar, gold, sized in em
 * so it sits in a line of text like an ordinary capital (viewBox: advance width × cap height).
 */
export function RubleP({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      viewBox="0 -640 535 640"
      aria-hidden="true"
      className={cn('shrink-0 overflow-visible', className)}
      style={{ height: '0.64em', width: '0.535em' }}
    >
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3dfb0" />
          <stop offset="1" stopColor="#c3a164" />
        </linearGradient>
      </defs>
      <g fill={`url(#g${id})`} stroke={`url(#g${id})`} strokeWidth="10" strokeLinejoin="round">
        <path d={GLYPH} />
        <rect x="28" y="-196" width="300" height="20" rx="4" />
      </g>
    </svg>
  );
}

/**
 * Cormorant ruble sign on the same monogram contour, filled with `currentColor`
 * so it inherits the surrounding tone (e.g. muted gold beside a hero Cormorant figure).
 */
export function RubleSign({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline leading-none', className)}>
      <span className="sr-only">₽</span>
      <svg
        viewBox="0 -640 535 640"
        aria-hidden="true"
        className="shrink-0 overflow-visible"
        style={{ height: '0.72em', width: '0.602em' }}
      >
        <g fill="currentColor" stroke="currentColor" strokeWidth="6" strokeLinejoin="round">
          <path d={GLYPH} />
          <rect x="28" y="-196" width="300" height="20" rx="4" />
        </g>
      </svg>
    </span>
  );
}

/**
 * «Рантье» with the first letter drawn as the gold ruble «Р». `inherit` keeps the surrounding
 * font (headings); by default it is the compact header size. Screen readers get the plain word.
 */
export function Wordmark({ className, inherit = false }: { className?: string; inherit?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline',
        !inherit && 'font-serif text-[23px] font-medium leading-none tracking-[0.01em] text-[var(--hi-text)]',
        className,
      )}
    >
      <span className="sr-only">Рантье</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        <RubleP />
        <span>антье</span>
      </span>
    </span>
  );
}
