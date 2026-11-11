import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaymentRecord } from '@/services/income-calculator';
import { calcCAGR } from '@/services/income-calculator';
import { Card } from '@/components/ds/surface';
import { Badge } from '@/components/ds/badge';
import { cn, formatNumber, formatPercent, formatShortDate } from '@/lib/utils';

export interface ChartPaymentRecord extends PaymentRecord {
  isForecast?: boolean;
}

interface PaymentHistoryChartProps {
  history: ChartPaymentRecord[];
  currency?: string;
  /** "на 1 бумагу" / "на 1 шт" / '' for a single object (rent, a deposit). */
  unitLabel?: string;
}

interface YearData {
  year: number;
  fact: number;
  forecast: number;
  payments: ChartPaymentRecord[];
}

const BAR_AREA = 112;

/** What a year paid; a year with nothing paid yet but a forecast tells the forecast as "≈…". */
function yearTotal(y: YearData): string {
  return y.fact === 0 && y.forecast > 0 ? `≈${formatNumber(y.forecast)}` : formatNumber(y.fact);
}

/** Payments per unit, grouped by calendar year; forecasts drawn hatched on top. */
export function PaymentHistoryChart({ history, currency = 'RUB', unitLabel = 'на 1 бумагу' }: PaymentHistoryChartProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();
  const unit = currency.toUpperCase() === 'RUB' ? '₽' : currency.toUpperCase();

  const years = useMemo<YearData[]>(() => {
    if (history.length === 0) return [];
    const map = new Map<number, YearData>();
    for (const p of history) {
      const year = p.date.getFullYear();
      const entry = map.get(year) ?? { year, fact: 0, forecast: 0, payments: [] };
      if (p.isForecast) entry.forecast += p.amount;
      else entry.fact += p.amount;
      entry.payments.push(p);
      map.set(year, entry);
    }
    const all = [...map.keys()];
    const first = Math.min(...all);
    const last = Math.max(...all, currentYear);
    const out: YearData[] = [];
    for (let y = first; y <= last; y++) {
      const e = map.get(y) ?? { year: y, fact: 0, forecast: 0, payments: [] };
      e.payments.sort((a, b) => a.date.getTime() - b.date.getTime());
      out.push(e);
    }
    return out;
  }, [history, currentYear]);

  const cagr = useMemo(() => calcCAGR(history.filter((p) => !p.isForecast), new Date()), [history]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [years.length]);

  if (years.length === 0) {
    return (
      <Card className="px-4 py-6 text-center text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
        Истории выплат пока нет
      </Card>
    );
  }

  const max = Math.max(...years.map((y) => y.fact + y.forecast), 1);
  const detail = selected != null ? years.find((y) => y.year === selected) : null;

  return (
    <Card className="px-4 pt-4 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="hi-eyebrow">{unitLabel ? `${unitLabel} по годам` : 'Выплаты по годам'}</div>
        {cagr != null && (
          <Badge tone={cagr >= 0 ? 'positive' : 'negative'} title="Среднегодовой рост выплат (CAGR)">
            {cagr >= 0 ? '+' : ''}{formatPercent(cagr)} в год
          </Badge>
        )}
      </div>

      {/* -mx-1 px-1: room for the selection frame (2px gap + 2px ring) of the edge columns, which the scroller would clip. */}
      <div ref={scrollRef} className="hi-scroll-hide -mx-1 mt-4 flex items-end gap-1.5 overflow-x-auto px-1 pb-1" style={{ height: BAR_AREA + 52 }}>
        {years.map((y, i) => {
          const isCurrent = y.year === currentYear;
          const isSelected = y.year === selected;
          const factH = y.fact > 0 ? Math.max(3, (y.fact / max) * BAR_AREA) : 0;
          const foreH = y.forecast > 0 ? Math.max(3, (y.forecast / max) * BAR_AREA) : 0;
          return (
            <button
              key={y.year}
              type="button"
              onClick={() => setSelected(isSelected ? null : y.year)}
              className="flex h-full min-w-[38px] max-w-[64px] flex-1 flex-col items-center justify-end outline-none"
              aria-label={`${y.year}: ${yearTotal(y)} ${unit}`}
            >
              <span className={cn('mb-1 text-[10px] font-semibold', isCurrent ? 'text-[var(--hi-text-3)]' : 'text-[var(--hi-text-2)]')}>
                {y.fact > 0
                  ? formatNumber(y.fact, y.fact < 10 ? 2 : 0)
                  : y.forecast > 0
                    ? `≈${formatNumber(y.forecast, y.forecast < 10 ? 2 : 0)}`
                    : '—'}
              </span>
              {/* The selection frame wraps the whole column — forecast part included — so it keeps the rounded top. */}
              <div
                className={cn(
                  'flex w-full flex-col items-stretch rounded-t-md transition-shadow',
                  isSelected && 'ring-2 ring-[var(--hi-gold-bright)] ring-offset-2 ring-offset-[var(--hi-surface)]',
                )}
                style={{ animation: `hi-bar-grow 0.8s var(--hi-ease-out) ${0.2 + i * 0.05}s both`, transformOrigin: 'bottom' }}
              >
                {foreH > 0 && (
                  <div
                    data-part="forecast"
                    className="w-full rounded-t-md border border-dashed border-[rgba(217,192,142,0.45)] border-b-0"
                    style={{
                      height: foreH,
                      background: 'repeating-linear-gradient(135deg, rgba(217,192,142,0.14) 0 4px, transparent 4px 8px)',
                    }}
                  />
                )}
                <div
                  data-part="fact"
                  className={cn('w-full', foreH > 0 ? '' : 'rounded-t-md')}
                  style={{
                    height: factH || 2,
                    background: y.fact > 0
                      ? isCurrent
                        ? 'linear-gradient(180deg, rgba(217,192,142,0.55), rgba(217,192,142,0.25))'
                        : 'linear-gradient(180deg, var(--hi-gold-bright), var(--hi-gold-deep))'
                      : 'var(--hi-line-strong)',
                    opacity: y.fact > 0 ? 0.55 + 0.45 * ((i + 1) / years.length) : 1,
                  }}
                />
              </div>
              <span className={cn('mt-1.5 text-[10.5px] font-semibold', isCurrent ? 'text-[var(--hi-gold)]' : 'text-[var(--hi-text-3)]')}>
                {String(y.year).slice(2).padStart(3, "'")}
              </span>
            </button>
          );
        })}
      </div>

      {detail && (
        <div className="mt-3 rounded-2xl border border-[var(--hi-line)] bg-[var(--hi-raised)] px-3.5 py-3 animate-[hi-fade-slide-down_0.25s_var(--hi-ease-out)_both]">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--hi-text-caption)] font-bold text-[var(--hi-gold)]">
              {detail.year}
              {detail.year === currentYear && <span className="ml-1.5 font-medium text-[var(--hi-text-3)]">· год не завершён</span>}
            </span>
            <span className="text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text)]">
              {yearTotal(detail)} {unit}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {detail.payments.length === 0 && <div className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">Выплат не было</div>}
            {detail.payments.map((p, i) => (
              <div key={i} className={cn('flex justify-between text-[length:var(--hi-text-caption)]', p.isForecast && 'opacity-70')}>
                <span className="text-[var(--hi-text-3)]">
                  {formatShortDate(p.date)}
                  {p.isForecast && <span className="ml-1.5 italic">прогноз</span>}
                </span>
                <span className="text-[var(--hi-text-2)]">{formatNumber(p.amount)} {unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
