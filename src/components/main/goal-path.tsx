import { Check, ChevronRight, Target } from 'lucide-react';
import { goalProgress, type GoalProgress } from '@/services/income-goal';
import { NBSP, cn, formatCurrencyFull, formatIncome } from '@/lib/utils';
import type { IncomePeriod } from '@/components/main/income-hero';

interface GoalStripProps {
  progress: GoalProgress;
  animate?: boolean;
  className?: string;
}

/**
 * The goal as time: 30 cells for the days of a month (12 for the months of a year),
 * gilded for as long as the portfolio pays. The last cell fills partially.
 */
export function GoalStrip({ progress, animate = false, className }: GoalStripProps) {
  const { cells, covered, reached } = progress;
  const full = Math.floor(covered + 1e-9);
  const partial = covered - full;

  return (
    <div
      role="img"
      aria-label={`Оплачено: ${progress.coveredLabel}`}
      className={cn('flex', cells === 30 ? 'gap-[2px]' : 'gap-1', className)}
    >
      {Array.from({ length: cells }, (_, i) => {
        const filled = i < full;
        const isPartial = i === full && partial > 0.02 && !reached;
        const isEdge = !reached && (isPartial || (filled && i === full - 1 && partial <= 0.02));
        return (
          <span
            key={i}
            className={cn(
              'relative h-2 flex-1 overflow-hidden rounded-[3px] bg-[var(--hi-line-strong)]',
              isEdge && 'shadow-[0_0_10px_var(--hi-gold-glow)]',
            )}
          >
            {(filled || isPartial) && (
              <span
                className="absolute inset-y-0 left-0 origin-left rounded-[3px] bg-[linear-gradient(180deg,var(--hi-gold-bright),var(--hi-gold)_60%,var(--hi-gold-deep))]"
                style={{
                  width: filled ? '100%' : `${Math.round(partial * 100)}%`,
                  animation: animate ? `hi-bar-grow-x 0.45s var(--hi-ease-out) ${0.75 + i * (0.5 / cells)}s both` : undefined,
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

interface GoalPathProps {
  /** Net income per month, RUB; null while loading. */
  incomePerMonth: number | null;
  /** Monthly goal; null when not set, undefined while loading. */
  goalPerMonth: number | null | undefined;
  mode: IncomePeriod;
  animate?: boolean;
  /** Opens the goal page: the goal, the forecast and the plan. */
  onOpen: () => void;
}

/** The lower half of the hero summary card: the way to the goal, or an invitation to set one. */
export function GoalPath({ incomePerMonth, goalPerMonth, mode, animate = false, onOpen }: GoalPathProps) {
  if (incomePerMonth == null || goalPerMonth === undefined) return null;

  if (goalPerMonth == null) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="hi-pressable flex w-full items-center justify-center gap-2 px-4 py-3 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)] active:bg-[var(--hi-raised)]"
      >
        <Target className="size-4 shrink-0 text-[var(--hi-gold)]" />
        <span className="font-semibold text-[var(--hi-gold)]">Поставить цель по доходу</span>
        <ChevronRight className="size-4 shrink-0" />
      </button>
    );
  }

  const progress = goalProgress(incomePerMonth, goalPerMonth, mode);
  const goalText =
    mode === 'month' ? `${formatCurrencyFull(goalPerMonth)} в месяц` : `${formatIncome(goalPerMonth * 12)} в год`;
  const period = mode === 'month' ? 'месяц' : 'год';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Цель ${goalText}: пройдено ${progress.percent}%. Открыть цель и прогноз`}
      className="hi-pressable block w-full px-4 pt-3.5 pb-4 text-center active:bg-[var(--hi-raised)]"
    >
      <div className="hi-eyebrow inline-flex items-center justify-center gap-1.5">
        <span>Цель{NBSP}·{NBSP}{goalText}</span>
        <ChevronRight aria-hidden="true" className="size-3.5 opacity-70" />
      </div>

      <div className="mt-1 flex items-baseline justify-center gap-1.5">
        {progress.reached && <Check aria-hidden="true" className="size-4 self-center text-[var(--hi-positive)]" />}
        <span data-testid="goal-percent" className="text-[length:var(--hi-text-heading)] font-semibold text-[var(--hi-text)]">
          {progress.percent}%
        </span>
        <span className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
          {progress.reached ? 'цель достигнута' : 'пути'}
        </span>
      </div>

      <GoalStrip progress={progress} animate={animate} className="mt-2.5" />

      <div className="mt-2.5 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-2)]">
        {progress.reached
          ? `Портфель оплачивает весь ${period}`
          : `Портфель оплачивает ${progress.coveredLabel}`}
      </div>
    </button>
  );
}
