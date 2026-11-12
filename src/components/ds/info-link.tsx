import { Info } from 'lucide-react';
import { TransitionLink } from '@/components/ui/transition-link';
import { guidePath, type GuideSectionId } from '@/lib/guide';
import { cn } from '@/lib/utils';

interface InfoLinkProps {
  /** Section of «Как устроен Рантье» to open. */
  section: GuideSectionId;
  /** Accessible name; says where the link leads. */
  label?: string;
  className?: string;
}

/** «i» in a circle: opens the guide at the section that explains the thing next to it. */
export function InfoLink({ section, label = 'Подробнее в «Как устроен Рантье»', className }: InfoLinkProps) {
  return (
    <TransitionLink
      to={guidePath(section)}
      aria-label={label}
      title="Подробнее"
      className={cn(
        'hi-pressable inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--hi-gold)] active:bg-[var(--hi-raised)]',
        className,
      )}
    >
      <Info className="size-[17px]" strokeWidth={1.9} />
    </TransitionLink>
  );
}
