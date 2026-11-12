import { Check } from 'lucide-react';
import { FORECAST_HORIZON_MONTHS, describeWait, goalDate, monthsToGoal } from '@/services/goal-forecast';
import { formatCurrencyFull } from '@/lib/utils';

export interface GoalScenario {
  /** Net income per month today. */
  incomePerMonth: number;
  /** Net yield per year, %, the forecast grows by; null or ≤ 0 = no growth. */
  yieldPercent: number | null;
  goalPerMonth: number;
  monthly: number;
  yearly: number;
}

/** "50 000 ₽ в месяц и 200 000 ₽ раз в год". Empty when there are no top-ups. */
export function topUpsText(monthly: number, yearly: number): string {
  const parts: string[] = [];
  if (monthly > 0) parts.push(`${formatCurrencyFull(monthly)} в месяц`);
  if (yearly > 0) parts.push(`${formatCurrencyFull(yearly)} раз в год`);
  return parts.join(' и ');
}

/** Months to the goal without and with top-ups (the latter only when there are some). */
export function scenarioMonths({ incomePerMonth, yieldPercent, goalPerMonth, monthly, yearly }: GoalScenario) {
  const base = { incomePerMonth, yieldPercent: yieldPercent ?? 0, goalPerMonth };
  const hasTopUps = monthly > 0 || yearly > 0;
  return {
    hasTopUps,
    without: monthsToGoal(base),
    with: hasTopUps ? monthsToGoal({ ...base, monthly, yearly }) : null,
  };
}

interface GoalAnswerProps extends Omit<GoalScenario, 'goalPerMonth'> {
  /** Null when no goal is set yet. */
  goalPerMonth: number | null;
  now?: Date;
}

const caption = 'text-[length:var(--hi-text-caption)] leading-relaxed';

/** The answer to "when?": the year the portfolio pays for the goal, and the other scenario under it. */
export function GoalAnswer({ goalPerMonth, now = new Date(), ...scenario }: GoalAnswerProps) {
  if (goalPerMonth == null) {
    return (
      <p className={`${caption} px-2 py-3 text-center text-[var(--hi-text-3)]`}>
        Введите цель — и увидите, когда портфель её оплатит.
      </p>
    );
  }

  if (scenario.incomePerMonth >= goalPerMonth) {
    return (
      <div className="text-center">
        <div className="inline-flex items-center gap-2 font-serif text-[length:var(--hi-text-large)] font-light leading-tight text-[var(--hi-gold)]">
          <Check aria-hidden="true" className="size-6 text-[var(--hi-positive)]" />
          Цель достигнута
        </div>
        <p className={`${caption} mt-1.5 text-[var(--hi-text-2)]`}>
          Портфель приносит {formatCurrencyFull(scenario.incomePerMonth)} в месяц — на{' '}
          {formatCurrencyFull(scenario.incomePerMonth - goalPerMonth)} больше цели.
        </p>
      </div>
    );
  }

  if (!(scenario.yieldPercent != null && scenario.yieldPercent > 0)) {
    return (
      <p className={`${caption} px-2 py-3 text-center text-[var(--hi-text-2)]`}>
        Укажите доходность больше нуля — без неё доход не растёт.
      </p>
    );
  }

  const months = scenarioMonths({ ...scenario, goalPerMonth });
  const main = months.hasTopUps ? months.with : months.without;
  const yearOf = (m: number) => goalDate(m, now).getFullYear();
  const later = now.getFullYear() + FORECAST_HORIZON_MONTHS / 12;

  return (
    <div className="text-center">
      <div className="hi-eyebrow">Цель будет достигнута</div>
      <div
        data-testid="goal-year"
        className="mt-1 font-serif text-[length:var(--hi-text-large)] font-light leading-tight bg-[linear-gradient(180deg,var(--hi-gold-bright)_10%,var(--hi-gold)_55%,var(--hi-gold-deep))] bg-clip-text text-transparent"
      >
        {main != null ? `в ${yearOf(main)} году` : `позже ${later} года`}
      </div>
      <p className={`${caption} mt-1 text-[var(--hi-text-2)]`}>
        {main != null ? describeWait(main) : 'больше чем через 50 лет'}
        <br />
        <span className="text-[var(--hi-text-3)]">
          {months.hasTopUps
            ? `с пополнениями ${topUpsText(scenario.monthly, scenario.yearly)}`
            : 'если реинвестировать выплаты'}
        </span>
      </p>
      <p className={`${caption} mt-3 border-t border-[var(--hi-line)] pt-3 text-[var(--hi-text-3)]`}>
        {months.hasTopUps
          ? months.without != null
            ? `Без пополнений — в ${yearOf(months.without)} году, ${describeWait(months.without)}.`
            : 'Без пополнений — больше чем через 50 лет.'
          : 'Пополнения ускорят — задайте их ниже.'}
      </p>
    </div>
  );
}
