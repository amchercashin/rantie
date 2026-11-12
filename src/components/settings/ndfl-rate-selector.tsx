import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

const PRESETS = [0, 13, 15] as const;

interface NdflRatePillsProps {
  rate: number;
  onChange: (rate: number) => void;
  /** Accessible name of the group, e.g. "НДФЛ: Акции". */
  label: string;
  /** The rate is not set here but follows the category: the active pill is outlined, not gold. */
  inherited?: boolean;
}

/** 0% · 13% · 15% · own rate. */
export function NdflRatePills({ rate, onChange, label, inherited = false }: NdflRatePillsProps) {
  const isCustom = !PRESETS.includes(rate as typeof PRESETS[number]);
  const [editing, setEditing] = useState(false);
  const [customValue, setCustomValue] = useState(isCustom ? String(rate) : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handlePreset = (preset: number) => {
    setEditing(false);
    setCustomValue('');
    onChange(preset);
  };

  const handleCustomClick = () => {
    setEditing(true);
    setCustomValue(isCustom ? String(rate) : '');
  };

  const commitCustom = () => {
    const parsed = parseFloat(customValue.replace(',', '.'));
    if (isFinite(parsed) && parsed >= 0 && parsed <= 100) {
      onChange(parsed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitCustom();
      inputRef.current?.blur();
    }
  };

  const activeClass = inherited
    ? 'text-[var(--hi-text-2)] shadow-[inset_0_0_0_1px_var(--hi-line-strong)]'
    : 'bg-[var(--hi-gold-tint)] text-[var(--hi-gold)] shadow-[inset_0_0_0_1px_rgba(217,192,142,0.35)]';
  const segmentClass = (active: boolean) =>
    cn(
      'min-w-[38px] rounded-full px-2 py-1.5 text-[length:var(--hi-text-caption)] font-semibold transition-colors',
      active ? activeClass : 'text-[var(--hi-text-3)]',
    );

  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--hi-line)] bg-[var(--hi-void)] p-0.5"
    >
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          aria-pressed={!isCustom && rate === preset && !editing}
          onClick={() => handlePreset(preset)}
          className={segmentClass(!isCustom && rate === preset && !editing)}
        >
          {preset}%
        </button>
      ))}
      {editing || isCustom ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={editing ? customValue : `${rate}%`}
          onChange={(e) => setCustomValue(e.target.value.replace(/[^0-9.,]/g, ''))}
          onFocus={() => {
            setEditing(true);
            setCustomValue(isCustom ? String(rate) : '');
          }}
          onBlur={commitCustom}
          onKeyDown={handleKeyDown}
          aria-label={`Своя ставка, ${label}`}
          className={cn(
            'w-14 rounded-full px-1 py-1 text-center text-base font-semibold outline-none',
            editing || !inherited ? 'bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]' : activeClass,
          )}
        />
      ) : (
        <button type="button" onClick={handleCustomClick} aria-label={`Своя ставка, ${label}`} className={segmentClass(false)}>
          …
        </button>
      )}
    </div>
  );
}

interface NdflRateSelectorProps {
  category: string;
  color: string;
  rate: number;
  onChange: (rate: number) => void;
}

/** A category row: colour dot, name, rate. */
export function NdflRateSelector({ category, color, rate, onChange }: NdflRateSelectorProps) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 items-center gap-2.5 text-[length:var(--hi-text-body)] text-[var(--hi-text)]">
        <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{category}</span>
      </span>
      <NdflRatePills rate={rate} onChange={onChange} label={`НДФЛ: ${category}`} />
    </div>
  );
}

interface NdflAccountRateRowProps {
  account: string;
  category: string;
  /** The account's own rate in this category, or undefined when it follows the category. */
  ownRate: number | undefined;
  categoryRate: number;
  onChange: (rate: number | null) => void;
}

/** An account under a category: follows the category rate until given its own. */
export function NdflAccountRateRow({ account, category, ownRate, categoryRate, onChange }: NdflAccountRateRowProps) {
  const inherited = ownRate == null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="break-words text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-2)]">{account}</div>
        {inherited ? (
          <div className="text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">как у категории</div>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-[length:var(--hi-text-micro)] font-semibold text-[var(--hi-gold)]"
          >
            своя · сбросить
          </button>
        )}
      </div>
      <NdflRatePills
        rate={ownRate ?? categoryRate}
        onChange={onChange}
        label={`НДФЛ: ${category}, ${account}`}
        inherited={inherited}
      />
    </div>
  );
}
