import { Trash2 } from 'lucide-react';
import type { PaymentHistory } from '@/models/types';
import { SourceBadge, type SourceKind } from '@/components/ds/badge';
import { cn, formatNumericDate, formatPrice } from '@/lib/utils';

interface PaymentRowProps {
  payment: PaymentHistory;
  currency: string;
  onDelete: (id: number) => void;
}

export function PaymentRow({ payment, currency, onDelete }: PaymentRowProps) {
  const source = (payment.dataSource === 'manual' ? 'manual' : payment.dataSource) as SourceKind;

  return (
    <div className={cn('group flex items-center gap-3 py-2 pl-4 pr-1.5', payment.isForecast && 'opacity-70')}>
      <span className="w-[86px] shrink-0 text-[length:var(--hi-text-caption)] text-[var(--hi-text-2)]">{formatNumericDate(payment.date)}</span>
      {/* Two badges («smart-lab» + «рекомендовано») don't fit next to the amount on a phone: they wrap. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        <SourceBadge source={source} />
        {payment.isForecast && <SourceBadge source={payment.recommended ? 'recommended' : 'forecast'} />}
      </span>
      <span className="shrink-0 text-right text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text)]">
        {formatPrice(payment.amount, currency)}
      </span>
      <button
        type="button"
        onClick={() => payment.id != null && onDelete(payment.id)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--hi-text-3)] active:bg-[var(--hi-negative-tint)] active:text-[var(--hi-negative)]"
        aria-label="Удалить выплату"
        title="Удалить"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
