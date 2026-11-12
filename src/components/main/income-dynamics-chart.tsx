import { useMemo, useState, type PointerEvent } from 'react';
import { useElementWidth } from '@/hooks/use-element-width';
import type { TimelinePoint } from '@/services/income-projection';
import { Card } from '@/components/ds/surface';
import { Badge } from '@/components/ds/badge';
import { cn, formatCurrency, formatCurrencyFull, formatPercent } from '@/lib/utils';

interface IncomeDynamicsChartProps {
  points: TimelinePoint[];
  /** Month shows monthly income, year shows the same rate ×12. */
  mode: 'month' | 'year';
  animate?: boolean;
}

const HEIGHT = 156;
const PAD_TOP = 18;
const PAD_BOTTOM = 24;
const PAD_X = 6;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function monthLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function linePath(coords: [number, number][]): string {
  return coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

/**
 * Monthly income of the current portfolio over time: two years of history
 * (solid) and the next twelve months of forecast (dashed). Scrub to inspect.
 */
export function IncomeDynamicsChart({ points, mode, animate = true }: IncomeDynamicsChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const k = mode === 'year' ? 12 : 1;

  const nowIndex = points.findIndex((p, i) => !p.future && (points[i + 1]?.future ?? true));
  const firstNonZero = points.findIndex((p) => p.value > 0);
  // Skip leading empty history so the line starts where income starts (keep ≥ 6 months).
  const start = Math.max(0, Math.min(firstNonZero === -1 ? 0 : firstNonZero - 1, nowIndex - 6));
  const visible = points.slice(start);
  const nowVisible = nowIndex - start;

  const geometry = useMemo(() => {
    const max = Math.max(...visible.map((p) => p.value * k), 1) * 1.12;
    const innerW = Math.max(width - PAD_X * 2, 10);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => PAD_X + (visible.length > 1 ? (i / (visible.length - 1)) * innerW : innerW / 2);
    const y = (v: number) => PAD_TOP + innerH - (v * k / max) * innerH;
    const coords = visible.map((p, i) => [x(i), y(p.value)] as [number, number]);
    const past = coords.slice(0, nowVisible + 1);
    const future = coords.slice(nowVisible);
    const baseline = PAD_TOP + innerH;
    const area = (c: [number, number][]) =>
      c.length ? `${linePath(c)}L${c[c.length - 1][0].toFixed(1)},${baseline}L${c[0][0].toFixed(1)},${baseline}Z` : '';
    const nowX = x(nowVisible);
    const years = visible
      .map((p, i) => ({ i, date: p.date }))
      // January ticks, skipping edges and any that would collide with the "сейчас" label.
      .filter(({ date, i }) => date.getMonth() === 0 && i > 1 && i < visible.length - 2 && Math.abs(x(i) - nowX) > 44);
    return { x, coords, past, future, pastArea: area(past), futureArea: area(future), baseline, years };
  }, [visible, width, k, nowVisible]);

  if (visible.length < 2 || visible.every((p) => p.value === 0)) return null;

  const current = visible[nowVisible];
  const yearAgo = visible[nowVisible - 12];
  const rawChange = yearAgo && yearAgo.value > 0 ? ((current.value - yearAgo.value) / yearAgo.value) * 100 : null;
  // A flat line (e.g. only fixed amounts) has nothing to report.
  const change = rawChange != null && Math.abs(rawChange) >= 0.05 ? rawChange : null;
  const focus = active != null ? visible[active] : null;

  const handlePointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD_X) / Math.max(rect.width - PAD_X * 2, 1);
    setActive(Math.max(0, Math.min(visible.length - 1, Math.round(rel * (visible.length - 1)))));
  };

  const [nowX, nowY] = geometry.coords[nowVisible];
  const focusCoord = active != null ? geometry.coords[active] : null;

  return (
    <Card className="overflow-hidden px-4 pt-4 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="hi-eyebrow">Динамика дохода</div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[length:var(--hi-text-heading)] font-semibold text-[var(--hi-text)]">
              {formatCurrencyFull((focus ?? current).value * k)}
            </span>
            <span className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
              {mode === 'year' ? 'в год' : 'в мес'} · {focus ? monthLabel(focus.date) : 'сейчас'}
              {focus?.future && ' · прогноз'}
            </span>
          </div>
        </div>
        {change != null && !focus && (
          <Badge tone={change >= 0 ? 'positive' : 'negative'} className="mt-0.5 shrink-0">
            {change >= 0 ? '+' : ''}{formatPercent(change)} за год
          </Badge>
        )}
      </div>

      <div ref={ref} className="relative mt-3 -mx-1">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-pan-y select-none"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label="График месячного дохода: история и прогноз"
        >
          <defs>
            <linearGradient id="hi-dyn-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--hi-gold)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--hi-gold)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="hi-dyn-future" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--hi-gold)" stopOpacity="0.10" />
              <stop offset="1" stopColor="var(--hi-gold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* baseline + year ticks */}
          <line x1={PAD_X} x2={width - PAD_X} y1={geometry.baseline} y2={geometry.baseline} stroke="var(--hi-line-strong)" />
          {geometry.years.map(({ i, date }) => (
            <g key={i}>
              <line x1={geometry.x(i)} x2={geometry.x(i)} y1={PAD_TOP} y2={geometry.baseline} stroke="var(--hi-line)" strokeDasharray="2 4" />
              <text x={geometry.x(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-[var(--hi-text-3)] text-[10px] font-semibold">
                {date.getFullYear()}
              </text>
            </g>
          ))}

          <path d={geometry.futureArea} fill="url(#hi-dyn-future)" />
          <path
            d={geometry.pastArea}
            fill="url(#hi-dyn-area)"
            style={animate ? { animation: 'hi-fade-in 1s ease-out 0.5s both' } : undefined}
          />
          <path
            d={linePath(geometry.past)}
            fill="none"
            stroke="var(--hi-gold)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1"
            style={animate ? { strokeDashoffset: 1, animation: 'hi-draw 1.3s var(--hi-ease-out) 0.3s forwards' } : undefined}
          />
          <path
            d={linePath(geometry.future)}
            fill="none"
            stroke="var(--hi-gold)"
            strokeOpacity="0.7"
            strokeWidth="1.75"
            strokeDasharray="4 5"
            strokeLinecap="round"
            style={animate ? { animation: 'hi-fade-in 0.8s ease-out 1.3s both' } : undefined}
          />

          {/* now marker */}
          <line x1={nowX} x2={nowX} y1={PAD_TOP - 6} y2={geometry.baseline} stroke="var(--hi-gold)" strokeOpacity="0.25" />
          <text x={nowX} y={HEIGHT - 6} textAnchor="middle" className="fill-[var(--hi-gold)] text-[10px] font-bold">
            сейчас
          </text>
          <circle cx={nowX} cy={nowY} r="7" fill="var(--hi-gold)" opacity="0.18" />
          <circle cx={nowX} cy={nowY} r="3.5" fill="var(--hi-gold-bright)" />

          {focusCoord && (
            <g>
              <line x1={focusCoord[0]} x2={focusCoord[0]} y1={PAD_TOP - 6} y2={geometry.baseline} stroke="var(--hi-text-2)" strokeOpacity="0.5" />
              <circle cx={focusCoord[0]} cy={focusCoord[1]} r="4.5" fill="var(--hi-void)" stroke="var(--hi-gold-bright)" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-1 flex items-center gap-4 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-[var(--hi-gold)]" /> факт
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-[var(--hi-gold)] opacity-70" /> прогноз
        </span>
        <span className={cn('ml-auto truncate', focus && 'invisible')}>
          через год ≈ {formatCurrency(visible[visible.length - 1].value * k)}
        </span>
      </div>
    </Card>
  );
}
