import { useMemo, useState } from 'react';
import type { Asset } from '@/models/types';
import { getTypeColor } from '@/models/account';
import type { MonthBucket, ProjectedPayment } from '@/services/income-projection';
import { Card } from '@/components/ds/surface';
import { TransitionLink } from '@/components/ui/transition-link';
import { cn, formatCompact, formatCurrency, formatCurrencyFull } from '@/lib/utils';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const BAR_H = 128;

const BASIS_LABEL: Record<ProjectedPayment['basis'], string> = {
  forecast: 'прогноз',
  scheduled: 'ожидается',
  'last-year': 'как год назад',
  average: 'средняя выплата',
  'last-payout': 'как последняя выплата',
  fixed: 'ваша сумма',
};

interface CashFlowCalendarProps {
  buckets: MonthBucket[];
  assetsById: Map<number, Asset>;
}

/**
 * When the money actually arrives: expected payments over the next 12 months,
 * month by month, stacked by asset class.
 */
export function CashFlowCalendar({ buckets, assetsById }: CashFlowCalendarProps) {
  // null = not chosen yet → the first month that has payments (data may still be loading on mount).
  const [chosen, setChosen] = useState<number | null>(null);
  const firstWithPayments = Math.max(0, buckets.findIndex((b) => b.total > 0));
  const selected = chosen ?? firstWithPayments;
  const setSelected = setChosen;
  const total = buckets.reduce((s, b) => s + b.total, 0);
  const max = Math.max(...buckets.map((b) => b.total), 1);

  const stacks = useMemo(
    () =>
      buckets.map((b) => {
        const byType = new Map<string, number>();
        for (const p of b.payments) {
          const type = assetsById.get(p.assetId)?.type ?? 'Прочее';
          byType.set(type, (byType.get(type) ?? 0) + p.amount);
        }
        return [...byType.entries()].sort((a, b) => b[1] - a[1]);
      }),
    [buckets, assetsById],
  );

  const bucket = buckets[Math.min(selected, buckets.length - 1)];
  const rows = [...bucket.payments].sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div className="space-y-4">
      <Card className="px-4 pt-4 pb-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="hi-eyebrow">Придёт за 12 мес</div>
            <div className="mt-1.5 text-[22px] font-semibold leading-none text-[var(--hi-text)]">{formatCurrencyFull(total)}</div>
          </div>
          <div className="shrink-0 whitespace-nowrap text-right text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
            в среднем
            <div className="font-semibold text-[var(--hi-gold)]">{formatCurrency(total / 12)} в мес</div>
          </div>
        </div>

        <div
          className="mt-5 grid items-end gap-1"
          style={{ height: BAR_H + 34, gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}
          role="tablist"
          aria-label="Месяцы"
        >
          {buckets.map((b, i) => {
            const active = i === selected;
            const h = b.total > 0 ? Math.max(4, (b.total / max) * BAR_H) : 2;
            return (
              <button
                key={`${b.year}-${b.month}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`${MONTHS_FULL[b.month]} ${b.year}: ${formatCurrencyFull(b.total)}`}
                onClick={() => setSelected(i)}
                className="group flex h-full flex-col items-center justify-end outline-none"
              >
                <span className={cn('mb-1 text-[9.5px] font-bold transition-opacity', active ? 'text-[var(--hi-gold)] opacity-100' : 'opacity-0')}>
                  {b.total > 0 ? formatCompact(b.total) : ''}
                </span>
                <div
                  className={cn(
                    'flex w-full flex-col-reverse overflow-hidden rounded-[5px] transition-all duration-300',
                    active ? 'opacity-100' : 'opacity-55 group-active:opacity-80',
                  )}
                  style={{ height: h, animation: `hi-bar-grow 0.7s var(--hi-ease-out) ${0.05 * i}s both`, transformOrigin: 'bottom' }}
                >
                  {b.total > 0 ? (
                    stacks[i].map(([type, amount]) => (
                      <div key={type} style={{ height: `${(amount / b.total) * 100}%`, backgroundColor: getTypeColor(type) }} />
                    ))
                  ) : (
                    <div className="h-full bg-[var(--hi-line-strong)]" />
                  )}
                </div>
                <span
                  className={cn(
                    'mt-1.5 whitespace-nowrap text-[10px] font-semibold',
                    active ? 'text-[var(--hi-gold)]' : 'text-[var(--hi-text-3)]',
                    // Narrow phones: label every other month (the selected one always).
                    !active && i % 2 === 1 && buckets.length > 12 && 'max-[400px]:invisible',
                  )}
                >
                  {MONTHS[b.month]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-baseline justify-between border-b border-[var(--hi-line)] px-4 py-3.5">
          <span className="font-serif text-[24px] leading-none text-[var(--hi-text)]">
            {MONTHS_FULL[bucket.month]} <span className="text-[var(--hi-text-3)]">{bucket.year}</span>
          </span>
          <span className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-positive)]">+{formatCurrencyFull(bucket.total)}</span>
        </div>
        {rows.length === 0 && (
          <div className="px-4 py-6 text-center text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">В этом месяце выплат не ожидается</div>
        )}
        {rows.map((p, i) => {
          const asset = assetsById.get(p.assetId);
          if (!asset) return null;
          return (
            <TransitionLink
              key={`${p.assetId}-${i}`}
              to={`/asset/${p.assetId}`}
              className="hi-pressable relative flex items-center gap-3 px-4 py-3 active:bg-[var(--hi-raised)] after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden"
            >
              <span className="w-7 shrink-0 text-center text-[15px] font-bold text-[var(--hi-text)]">
                {p.estimated ? '—' : p.date.getDate()}
              </span>
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: getTypeColor(asset.type) }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[length:var(--hi-text-body)] text-[var(--hi-text)]">{asset.name}</div>
                <div className="text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
                  {BASIS_LABEL[p.basis]}{p.estimated && ' · дата условная'}
                </div>
              </div>
              <span className="shrink-0 text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{formatCurrencyFull(p.amount)}</span>
            </TransitionLink>
          );
        })}
      </Card>
    </div>
  );
}
