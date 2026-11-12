import { useMemo, useState, type PointerEvent } from 'react';
import { useElementWidth } from '@/hooks/use-element-width';
import { Segmented } from '@/components/ds/segmented';
import { FORECAST_HORIZON_MONTHS, capitalPath, goalDate, incomePath } from '@/services/goal-forecast';
import { scenarioMonths, type GoalScenario } from '@/components/goal/goal-answer';
import { cn, formatCurrency, formatCurrencyFull } from '@/lib/utils';

const HEIGHT = 168;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;
const PAD_X = 6;

type Metric = 'income' | 'capital';

function linePath(coords: [number, number][]): string {
  return coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

/**
 * How long to draw: a little past the later of the two arrivals, at least five years, at most fifty.
 * When only the top-ups reach the goal, a stretch more, so the line without them visibly lags behind.
 */
function horizonOf(without: number | null, withTopUps: number | null, hasTopUps: boolean): number {
  let months: number;
  if (without != null && (!hasTopUps || withTopUps != null)) months = Math.max(without, withTopUps ?? 0) * 1.15 + 6;
  else if (withTopUps != null) months = withTopUps * 1.6;
  else months = FORECAST_HORIZON_MONTHS;
  return Math.min(FORECAST_HORIZON_MONTHS, Math.max(60, Math.ceil(months / 12) * 12));
}

function tickStep(years: number): number {
  if (years <= 6) return 1;
  if (years <= 12) return 2;
  if (years <= 25) return 5;
  return 10;
}

interface GoalForecastChartProps extends GoalScenario {
  /** Portfolio value today, RUB — the start of the capital line. */
  capital: number;
  now?: Date;
}

/**
 * From today to the goal and a little beyond, as income per month (the default: the goal is a level,
 * the arrivals are marked on it) or as capital (the arrivals are marked on the lines, with the capital
 * they take). With top-ups — solid; without them — dashed, or the only, solid line when there are none.
 */
export function GoalForecastChart({ now = new Date(), capital, ...scenario }: GoalForecastChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>('income');
  const { incomePerMonth, goalPerMonth, monthly, yearly } = scenario;
  const yieldPercent = scenario.yieldPercent ?? 0;

  const series = useMemo(() => {
    const months = scenarioMonths({ incomePerMonth, yieldPercent, goalPerMonth, monthly, yearly });
    const horizon = horizonOf(months.without, months.with, months.hasTopUps);
    const base = { incomePerMonth, yieldPercent, months: horizon };
    const withBase = { ...base, monthly, yearly };
    return {
      months,
      horizon,
      income: {
        without: incomePath(base),
        withTopUps: months.hasTopUps ? incomePath(withBase) : null,
      },
      capital: {
        without: capitalPath({ ...base, capital }),
        withTopUps: months.hasTopUps ? capitalPath({ ...withBase, capital }) : null,
      },
    };
  }, [incomePerMonth, yieldPercent, goalPerMonth, monthly, yearly, capital]);

  const { months, horizon } = series;
  const lines = series[metric];
  const main = lines.withTopUps ?? lines.without;
  const other = lines.withTopUps ? lines.without : null;

  const geometry = useMemo(() => {
    const top = Math.max(...main, 1);
    const max = metric === 'income' ? Math.max(goalPerMonth * 1.18, top) * 1.04 : top * 1.12;
    const innerW = Math.max(width - PAD_X * 2, 10);
    const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const x = (m: number) => PAD_X + (m / horizon) * innerW;
    const y = (v: number) => PAD_TOP + innerH - (v / max) * innerH;
    const coords = (path: number[]) => path.map((v, m) => [x(m), y(v)] as [number, number]);
    const baseline = PAD_TOP + innerH;
    const mainCoords = coords(main);
    const area = `${linePath(mainCoords)}L${x(horizon).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z`;
    const step = tickStep(horizon / 12);
    const ticks: number[] = [];
    for (let m = step * 12; m < horizon - 6; m += step * 12) ticks.push(m);
    return { x, y, baseline, mainCoords, otherCoords: other ? coords(other) : null, area, ticks };
  }, [main, other, metric, goalPerMonth, horizon, width]);

  const { x, y, baseline } = geometry;
  const goalY = y(goalPerMonth);
  const yearAt = (m: number) => goalDate(m, now).getFullYear();
  const format = metric === 'income' ? formatCurrencyFull : formatCurrency;

  const handlePointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - rect.left - PAD_X) / Math.max(rect.width - PAD_X * 2, 1);
    setActive(Math.max(0, Math.min(horizon, Math.round(rel * horizon))));
  };

  // Where each scenario reaches the goal: on the goal level for income, on its own line for capital.
  const markers = [
    months.hasTopUps && months.without != null && { m: months.without, main: false, path: lines.without },
    { m: months.hasTopUps ? months.with : months.without, main: true, path: main },
  ]
    .filter((mk): mk is { m: number; main: boolean; path: number[] } => !!mk && mk.m != null && mk.m <= horizon)
    .map((mk) => ({
      ...mk,
      cy: metric === 'income' ? goalY : y(mk.path[mk.m]),
      label: metric === 'income' ? String(yearAt(mk.m)) : formatCurrency(mk.path[mk.m]),
    }));

  const mainValue = active != null ? main[active] : null;
  const otherValue = active != null && other ? other[active] : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Segmented
          size="sm"
          ariaLabel="Что показать на графике"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'income', label: 'Доход в месяц' },
            { value: 'capital', label: 'Капитал' },
          ]}
        />
        {active != null && (
          <span className="truncate pr-1 text-[length:var(--hi-text-micro)] font-semibold text-[var(--hi-text-2)]">
            {active === 0 ? 'сейчас' : `${yearAt(active)} год`}
          </span>
        )}
      </div>

      <div ref={ref} className="relative mt-2 -mx-1">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-pan-y select-none"
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={() => setActive(null)}
          role="img"
          aria-label={
            metric === 'income'
              ? 'График дохода в месяц до цели: с пополнениями и без'
              : 'График капитала до цели: с пополнениями и без'
          }
        >
          <defs>
            <linearGradient id="hi-goal-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--hi-gold)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--hi-gold)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line x1={PAD_X} x2={width - PAD_X} y1={baseline} y2={baseline} stroke="var(--hi-line-strong)" />
          {geometry.ticks.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={PAD_TOP} y2={baseline} stroke="var(--hi-line)" strokeDasharray="2 4" />
              <text x={x(m)} y={HEIGHT - 6} textAnchor="middle" className="fill-[var(--hi-text-3)] text-[10px] font-semibold">
                {yearAt(m)}
              </text>
            </g>
          ))}
          <text x={PAD_X} y={HEIGHT - 6} textAnchor="start" className="fill-[var(--hi-gold)] text-[10px] font-bold">
            сейчас
          </text>

          {metric === 'income' && (
            <g>
              <line x1={PAD_X} x2={width - PAD_X} y1={goalY} y2={goalY} stroke="var(--hi-gold)" strokeOpacity="0.45" strokeDasharray="3 4" />
              <text x={PAD_X + 2} y={goalY - 6} textAnchor="start" className="fill-[var(--hi-text-2)] text-[10px] font-semibold">
                цель · {formatCurrency(goalPerMonth)}
              </text>
            </g>
          )}
          {metric === 'capital' && (
            <text x={PAD_X + 2} y={y(main[0]) - 6} textAnchor="start" className="fill-[var(--hi-text-2)] text-[10px] font-semibold">
              {formatCurrency(main[0])}
            </text>
          )}

          <path d={geometry.area} fill="url(#hi-goal-area)" />
          {geometry.otherCoords && (
            <path
              d={linePath(geometry.otherCoords)}
              fill="none"
              stroke="var(--hi-gold)"
              strokeOpacity="0.55"
              strokeWidth="1.6"
              strokeDasharray="4 5"
              strokeLinecap="round"
            />
          )}
          <path d={linePath(geometry.mainCoords)} fill="none" stroke="var(--hi-gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

          {markers.map(({ m, main: isMain, cy, label }) => (
            <g key={isMain ? 'main' : 'other'}>
              <circle
                cx={x(m)}
                cy={cy}
                r={isMain ? 4.5 : 3.5}
                fill="var(--hi-void)"
                stroke={isMain ? 'var(--hi-gold-bright)' : 'var(--hi-gold)'}
                strokeOpacity={isMain ? 1 : 0.7}
                strokeWidth="2"
              />
              <text
                x={Math.min(Math.max(x(m), PAD_X + 22), width - PAD_X - 22)}
                y={isMain ? cy - 10 : cy + 17}
                textAnchor="middle"
                className={cn('text-[10px] font-bold', isMain ? 'fill-[var(--hi-gold-bright)]' : 'fill-[var(--hi-text-3)]')}
              >
                {label}
              </text>
            </g>
          ))}

          {active != null && mainValue != null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={PAD_TOP} y2={baseline} stroke="var(--hi-text-2)" strokeOpacity="0.5" />
              <circle cx={x(active)} cy={y(mainValue)} r="4" fill="var(--hi-void)" stroke="var(--hi-gold-bright)" strokeWidth="2" />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
        {active != null ? (
          <>
            <span className="font-semibold text-[var(--hi-text)]">{format(mainValue)}</span>
            {otherValue != null && <span>без пополнений {format(otherValue)}</span>}
          </>
        ) : months.hasTopUps ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[var(--hi-gold)]" /> с пополнениями
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-[var(--hi-gold)] opacity-60" /> без пополнений
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-[var(--hi-gold)]" /> выплаты реинвестируются
          </span>
        )}
      </div>
    </div>
  );
}
