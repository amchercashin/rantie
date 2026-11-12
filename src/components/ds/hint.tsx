import { useState, type ReactNode } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isHintDismissed, dismissHint } from '@/lib/hints';
import type { GuideSectionId } from '@/lib/guide';
import { InfoLink } from './info-link';

interface HintProps {
  /** Storage id; once dismissed the hint never comes back (until hints are reset in settings). */
  id: string;
  title?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  /** Section of «Как устроен Рантье» with the full story: adds an «i» in the bottom-right corner. */
  more?: GuideSectionId;
  className?: string;
}

/**
 * Inline, in-flow coach mark. Replaces coordinate-based spotlights:
 * it never covers content and cannot be mispositioned.
 * Keep the text a short version of the guide section it links to (`more`).
 */
export function Hint({ id, title, children, icon, more, className }: HintProps) {
  const [hidden, setHidden] = useState(() => isHintDismissed(id));
  const [leaving, setLeaving] = useState(false);
  if (hidden) return null;

  const close = () => {
    setLeaving(true);
    dismissHint(id);
    setTimeout(() => setHidden(true), 220);
  };

  return (
    <div
      role="note"
      className={cn(
        'relative flex gap-3 rounded-[20px] border border-[rgba(217,192,142,0.18)] p-4 pr-11',
        // ✕ in the top corner and «i» in the bottom one share the right gutter: room for both.
        more && 'min-h-[88px]',
        'bg-[linear-gradient(135deg,rgba(217,192,142,0.10),rgba(217,192,142,0.03))]',
        'transition-all duration-200',
        leaving ? 'opacity-0 -translate-y-1 scale-[0.98]' : 'animate-[hi-fade-slide-up_0.5s_var(--hi-ease-out)_both]',
        className,
      )}
    >
      <div className="mt-0.5 text-[var(--hi-gold)] [&_svg]:size-[18px]">{icon ?? <Lightbulb />}</div>
      <div className="min-w-0">
        {title && <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{title}</div>}
        <div className={cn('text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]', title && 'mt-0.5')}>
          {children}
        </div>
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Скрыть подсказку"
        className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-[var(--hi-text-3)] active:bg-[var(--hi-raised)]"
      >
        <X className="size-4" />
      </button>
      {more && <InfoLink section={more} className="absolute bottom-2 right-2" />}
    </div>
  );
}
