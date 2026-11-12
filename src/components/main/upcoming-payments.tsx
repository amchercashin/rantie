import type { Asset } from '@/models/types';
import type { ProjectedPayment } from '@/services/income-projection';
import { getTypeColor } from '@/models/account';
import { Card } from '@/components/ds/surface';
import { TransitionLink } from '@/components/ui/transition-link';
import { cn, formatCurrencyFull } from '@/lib/utils';

const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function daysUntil(date: Date, now: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

function whenLabel(days: number): string {
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days < 7) return `через ${days} дн`;
  if (days < 31) return `через ${Math.round(days / 7)} нед`;
  return `через ${Math.round(days / 30)} мес`;
}

interface UpcomingPaymentsProps {
  payments: ProjectedPayment[];
  assetsById: Map<number, Asset>;
  now?: Date;
}

export function UpcomingPayments({ payments, assetsById, now = new Date() }: UpcomingPaymentsProps) {
  if (payments.length === 0) return null;
  return (
    <Card className="overflow-hidden">
      {payments.map((p, i) => {
        const asset = assetsById.get(p.assetId);
        if (!asset) return null;
        const days = daysUntil(p.date, now);
        return (
          <TransitionLink
            key={`${p.assetId}-${p.date.getTime()}-${i}`}
            to={`/asset/${p.assetId}`}
            className="hi-pressable relative flex items-center gap-3.5 px-4 py-3 active:bg-[var(--hi-raised)] after:absolute after:bottom-0 after:left-[68px] after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden"
          >
            <div
              className={cn(
                'flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl border leading-none',
                i === 0
                  ? 'border-[rgba(217,192,142,0.3)] bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]'
                  : 'border-[var(--hi-line)] bg-[var(--hi-raised)] text-[var(--hi-text)]',
              )}
            >
              <span className="text-[16px] font-bold">{p.date.getDate()}</span>
              <span className="mt-0.5 text-[9.5px] font-semibold uppercase tracking-wider opacity-70">{MONTHS_GEN[p.date.getMonth()]}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--hi-text-body)] font-medium text-[var(--hi-text)]">{asset.name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                <span className="size-1.5 rounded-full" style={{ backgroundColor: getTypeColor(asset.type) }} />
                <span className="truncate">
                  {whenLabel(days)} · {p.basis === 'forecast' ? 'прогноз' : p.basis === 'recommended' ? 'рекомендовано' : 'ожидается'}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-positive)]">
              +{formatCurrencyFull(p.amount)}
            </div>
          </TransitionLink>
        );
      })}
    </Card>
  );
}
