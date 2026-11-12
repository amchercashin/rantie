import type { KeyboardEvent, ReactNode } from 'react';
import { Field, TextInput } from '@/components/ds/field';

/** Thin spaces between thousands while typing: "150000" → "150 000". */
export function groupDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Draft of a stored amount: "" for none. */
export function draftOf(amount: number | null | undefined): string {
  return amount != null && amount > 0 ? groupDraft(String(Math.round(amount))) : '';
}

/** Enter closes the keyboard: the value is already applied as it is typed. */
export function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}

interface MoneyFieldProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onChange: (draft: string) => void;
  onBlur?: () => void;
  className?: string;
}

/** Whole rubles, grouped as they are typed. */
export function MoneyField({ id, label, hint, value, placeholder, autoFocus, onChange, onBlur, className }: MoneyFieldProps) {
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <TextInput
        id={id}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        suffix="₽"
        onChange={(e) => onChange(groupDraft(e.target.value))}
        onBlur={onBlur}
        onKeyDown={blurOnEnter}
      />
    </Field>
  );
}
