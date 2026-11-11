import { forwardRef, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { glow?: boolean }>(function Card({ className, glow, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'rounded-[22px] border border-[var(--hi-line)]',
        glow ? 'hi-card-glow' : 'bg-[var(--hi-surface)]',
        className,
      )}
      {...props}
    />
  );
});

interface SectionProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Extra line under the title */
  description?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function Section({ title, action, description, children, className, ref }: SectionProps) {
  return (
    <section ref={ref} className={cn('mt-8 first:mt-0', className)}>
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 mb-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="hi-eyebrow">{title}</h2>}
            {description && (
              <p className="mt-1.5 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  className?: string;
}

/** A row inside a Card list; separators are drawn between siblings. */
export function ListRow({ leading, title, subtitle, trailing, chevron, onClick, className }: ListRowProps) {
  const classes = cn(
    'relative flex w-full items-center gap-3 px-4 py-3.5 text-left min-h-[56px]',
    'after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden',
    onClick && 'hi-pressable active:bg-[var(--hi-raised)]',
    className,
  );
  const content = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[length:var(--hi-text-body)] text-[var(--hi-text)] leading-snug truncate">{title}</div>
        {subtitle && (
          <div className="mt-0.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)] leading-snug truncate">{subtitle}</div>
        )}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {chevron && <ChevronRight className="size-4 shrink-0 text-[var(--hi-text-3)]" />}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>{content}</button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}

export function Stat({ label, value, hint, accent, className }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="hi-eyebrow truncate">{label}</div>
      <div
        className={cn(
          'mt-1.5 text-[length:var(--hi-text-heading)] font-semibold leading-tight truncate',
          accent ? 'text-[var(--hi-gold)]' : 'text-[var(--hi-text)]',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)] truncate">{hint}</div>}
    </div>
  );
}

export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 rounded-full shrink-0', className)}
      style={{ backgroundColor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
    />
  );
}

/** Round monogram avatar for an asset — ticker initials on a tinted disc. */
export function AssetAvatar({ label, color, className }: { label: string; color: string; className?: string }) {
  const text = label.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '•';
  return (
    <span
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full text-[11px] font-bold tracking-wide shrink-0',
        className,
      )}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, ${color} 13%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 22%, transparent)`,
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center px-6 py-12', className)}>
      {icon && (
        <div className="relative mb-5">
          <div className="absolute inset-0 -m-4 rounded-full bg-[var(--hi-gold-tint)] blur-xl animate-[hi-glow-breathe_4s_ease-in-out_infinite]" />
          <div className="relative flex size-16 items-center justify-center rounded-[20px] border border-[var(--hi-line-strong)] bg-[var(--hi-surface)] text-[var(--hi-gold)] [&_svg]:size-7">
            {icon}
          </div>
        </div>
      )}
      <div className="font-serif text-[length:var(--hi-text-large)] leading-tight text-[var(--hi-text)]">{title}</div>
      {description && (
        <p className="mt-2 max-w-[300px] text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]">{description}</p>
      )}
      {children && <div className="mt-6 w-full max-w-[320px] space-y-2.5">{children}</div>}
    </div>
  );
}
