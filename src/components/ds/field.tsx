import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isTouchPrimary } from '@/lib/input-device';

const CONTROL =
  'w-full rounded-2xl border border-[var(--hi-line)] bg-[var(--hi-surface)] px-4 text-base text-[var(--hi-text)] ' +
  'placeholder:text-[var(--hi-text-3)] outline-none transition-[border-color,box-shadow] duration-200 ' +
  'focus:border-[var(--hi-gold-deep)] focus:shadow-[0_0_0_4px_var(--hi-gold-tint)]';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}

export function Field({ label, hint, children, className, htmlFor }: FieldProps) {
  return (
    <div className={cn('block', className)}>
      <label htmlFor={htmlFor} className="mb-1.5 block px-1 text-[length:var(--hi-text-caption)] font-medium text-[var(--hi-text-2)]">
        {label}
      </label>
      {children}
      {hint && <div className="mt-1.5 px-1 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">{hint}</div>}
    </div>
  );
}

/**
 * `autoFocus` on the fields below works only with a mouse: on a touch screen focusing would pop up
 * the keyboard before the user has even read the sheet (see `isTouchPrimary`).
 */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }>(
  function TextInput({ className, suffix, autoFocus, ...props }, ref) {
    const focus = autoFocus && !isTouchPrimary();
    if (suffix == null) {
      return <input ref={ref} className={cn(CONTROL, 'h-12', className)} autoFocus={focus} {...props} />;
    }
    return (
      <div className="relative">
        <input ref={ref} className={cn(CONTROL, 'h-12 pr-14', className)} autoFocus={focus} {...props} />
        <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[length:var(--hi-text-body)] text-[var(--hi-text-3)]">
          {suffix}
        </span>
      </div>
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, autoFocus, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(CONTROL, 'py-3 min-h-[120px] resize-y', className)}
        autoFocus={autoFocus && !isTouchPrimary()}
        {...props}
      />
    );
  },
);

export const SelectInput = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className, children, ...props }, ref) {
    return (
      <div className="relative">
        <select ref={ref} className={cn(CONTROL, 'h-12 appearance-none pr-10', className)} {...props}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--hi-text-3)]" />
      </div>
    );
  },
);

/** Parse a user-typed decimal: accepts spaces and a comma. Returns NaN when empty/invalid. */
export function parseDecimal(raw: string): number {
  const cleaned = raw.replace(/[\s ]/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  return Number(cleaned);
}
