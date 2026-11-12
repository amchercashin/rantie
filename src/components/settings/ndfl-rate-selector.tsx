import { useState, useRef, useEffect } from 'react';

const PRESETS = [0, 13, 15] as const;

interface NdflRateSelectorProps {
  category: string;
  color: string;
  rate: number;
  onChange: (rate: number) => void;
}

export function NdflRateSelector({ category, color, rate, onChange }: NdflRateSelectorProps) {
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
    const parsed = parseFloat(customValue);
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

  const segmentClass = (active: boolean) =>
    `min-w-[38px] rounded-full px-2 py-1.5 text-[length:var(--hi-text-caption)] font-semibold transition-colors ${
      active
        ? 'bg-[var(--hi-gold-tint)] text-[var(--hi-gold)] shadow-[inset_0_0_0_1px_rgba(217,192,142,0.35)]'
        : 'text-[var(--hi-text-3)]'
    }`;

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="flex min-w-0 items-center gap-2.5 text-[length:var(--hi-text-body)] text-[var(--hi-text)]">
        <span className="size-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate">{category}</span>
      </span>
      <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--hi-line)] bg-[var(--hi-void)] p-0.5">
        {PRESETS.map((preset) => (
          <button
            key={preset}
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
            onChange={(e) => setCustomValue(e.target.value.replace(/[^0-9.]/g, ''))}
            onFocus={() => {
              setEditing(true);
              setCustomValue(isCustom ? String(rate) : '');
            }}
            onBlur={commitCustom}
            onKeyDown={handleKeyDown}
            aria-label={`Своя ставка НДФЛ для ${category}`}
            className="w-14 rounded-full bg-[var(--hi-gold-tint)] px-1 py-1 text-center text-base font-semibold text-[var(--hi-gold)] outline-none"
          />
        ) : (
          <button
            onClick={handleCustomClick}
            className={segmentClass(false)}
          >
            …
          </button>
        )}
      </div>
    </div>
  );
}
