import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { PaymentHistory } from '@/models/types';
import { parseDecimal } from '@/components/ds/field';
import { isTouchPrimary } from '@/lib/input-device';

interface AddPaymentFormProps {
  assetId: number;
  paymentType: PaymentHistory['type'];
  currency: string;
  onAdd: (payment: Omit<PaymentHistory, 'id'>) => void;
  onCancel: () => void;
}

const INPUT =
  'h-11 min-w-0 w-full rounded-xl border border-[var(--hi-line)] bg-[var(--hi-surface)] px-3 text-base text-[var(--hi-text)] outline-none placeholder:text-[var(--hi-text-3)] focus:border-[var(--hi-gold-deep)]';

/** Inline form: date + amount per unit (before tax). */
export function AddPaymentForm({ assetId, paymentType, currency, onAdd, onCancel }: AddPaymentFormProps) {
  const [dateStr, setDateStr] = useState(new Date().toISOString().slice(0, 10));
  const [amountStr, setAmountStr] = useState('');
  const amount = parseDecimal(amountStr);
  const valid = Number.isFinite(amount) && amount > 0 && !!dateStr;

  const handleSubmit = () => {
    if (!valid) return;
    onAdd({ assetId, amount, date: new Date(`${dateStr}T12:00:00`), type: paymentType, dataSource: 'manual' });
    setAmountStr('');
  };

  return (
    <div className="border-t border-[var(--hi-line)] bg-[color-mix(in_srgb,var(--hi-void)_45%,transparent)] px-4 py-3 animate-[hi-fade-slide-down_0.25s_var(--hi-ease-out)_both]">
      <div className="mb-2 text-[length:var(--hi-text-micro)] font-semibold uppercase tracking-[0.12em] text-[var(--hi-text-3)]">
        Новая выплата на 1 шт, до НДФЛ
      </div>
      <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_44px_44px] items-center gap-2">
        <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} aria-label="Дата выплаты" className={INPUT} />
        <input
          type="text"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="До НДФЛ"
          aria-label={`Сумма выплаты до НДФЛ, ${currency}`}
          className={INPUT}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          autoFocus={!isTouchPrimary()}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!valid}
          aria-label="Сохранить выплату"
          className="inline-flex size-11 items-center justify-center rounded-xl bg-[var(--hi-gold)] text-[#1a1509] disabled:opacity-30"
        >
          <Check className="size-5" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Отмена"
          className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--hi-line)] text-[var(--hi-text-3)]"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
