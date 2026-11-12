import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, TrendingUp } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Card, Section } from '@/components/ds/surface';
import { Segmented } from '@/components/ds/segmented';
import { Field, TextInput, parseDecimal } from '@/components/ds/field';
import { Button } from '@/components/ds/button';
import { InfoLink } from '@/components/ds/info-link';
import { useFeedback } from '@/components/ds/feedback';
import { MissingRateNotice } from '@/components/shared/missing-rate-notice';
import { GoalStrip } from '@/components/main/goal-path';
import { GoalAnswer } from '@/components/goal/goal-answer';
import { GoalForecastChart } from '@/components/goal/goal-forecast-chart';
import { MoneyField, blurOnEnter, draftOf } from '@/components/goal/money-field';
import { usePortfolioStats } from '@/hooks/use-portfolio-stats';
import { useIncomeGoal } from '@/hooks/use-income-goal';
import { useGoalPlan } from '@/hooks/use-goal-plan';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { goalProgress, setGoalPlan, setIncomeGoal, type GoalPlan } from '@/services/income-goal';
import { forecastYieldPercent } from '@/services/goal-forecast';
import type { CalculatedAssetStats } from '@/services/portfolio-calculator';
import { cn, formatIncome, formatPercent } from '@/lib/utils';
import { readStorage, writeStorage } from '@/lib/safe-storage';

/** The forecast is folded until the user opens it once; then it stays open on later visits. */
const FORECAST_OPEN_KEY = 'rt-goal-forecast-open';

/**
 * Writes run half a second after the last keystroke and at once when the page is left: every write
 * to `settings` makes the open screens recount the portfolio, so not one per digit.
 */
function useDeferredSave() {
  const pending = useRef(new Map<string, () => unknown>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const jobs = [...pending.current.values()];
    pending.current.clear();
    for (const job of jobs) void job();
  }, []);

  const schedule = useCallback(
    (key: string, job: () => unknown) => {
      pending.current.set(key, job);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
    },
    [flush],
  );

  const cancel = useCallback((key: string) => pending.current.delete(key), []);

  useEffect(() => flush, [flush]);
  return { schedule, flush, cancel };
}

/** "7,6" for the yield field. */
function yieldDraftOf(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',');
}

/** Digits and one comma, a few characters: "12,5". */
function cleanYieldDraft(raw: string): string {
  const [whole, ...rest] = raw.replace('.', ',').replace(/[^\d,]/g, '').split(',');
  return (rest.length ? `${whole.slice(0, 3)},${rest.join('').slice(0, 2)}` : whole.slice(0, 3));
}

export function GoalPage() {
  const stats = usePortfolioStats();
  const goal = useIncomeGoal();
  const plan = useGoalPlan();
  const ready = !stats.isLoading && goal !== undefined && plan !== undefined;

  return (
    <AppShell back="/" title="Цель" subtitle="Сколько нужно в месяц, чтобы жить на доход с капитала">
      {ready && <GoalPlanner stats={stats} goal={goal} initialGoal={goal} initialPlan={plan} />}
    </AppShell>
  );
}

interface GoalPlannerProps {
  stats: ReturnType<typeof usePortfolioStats>;
  /** The goal as stored right now (follows saves). */
  goal: number | null;
  initialGoal: number | null;
  initialPlan: GoalPlan;
}

function GoalPlanner({ stats, goal, initialGoal, initialPlan }: GoalPlannerProps) {
  const { portfolio, categories, assetsById, missingRates } = stats;
  const { toast, confirm } = useFeedback();
  const ndflRates = useNdflRates();
  const taxed = categories.some((c) => (ndflRates.get(c.type) ?? 0) > 0);
  const { schedule, flush, cancel } = useDeferredSave();

  const [goalDraft, setGoalDraft] = useState(() => draftOf(initialGoal));
  const [monthlyDraft, setMonthlyDraft] = useState(() => draftOf(initialPlan.monthly));
  const [yearlyDraft, setYearlyDraft] = useState(() => draftOf(initialPlan.yearly));
  const [yearlyOpen, setYearlyOpen] = useState(initialPlan.yearly > 0);
  const [ownYield, setOwnYield] = useState(initialPlan.customYield != null);
  const [forecastOpen, setForecastOpen] = useState(() => readStorage(FORECAST_OPEN_KEY) === '1');
  const [yieldDraft, setYieldDraft] = useState(() =>
    initialPlan.customYield != null ? yieldDraftOf(initialPlan.customYield) : '',
  );

  const assets = useMemo(() => [...assetsById.values()], [assetsById]);
  const portfolioYield = useMemo(() => forecastYieldPercent(assets), [assets]);
  const unpricedIncome = useMemo(
    () => assets.some((a: CalculatedAssetStats) => !(a.value > 0) && a.incomePerYear > 0 && !a.rateMissing),
    [assets],
  );

  const income = portfolio.totalIncomePerMonth;
  const goalValue = parseDecimal(goalDraft);
  const goalPerMonth = goalValue > 0 ? goalValue : null;
  const monthly = Math.max(0, parseDecimal(monthlyDraft) || 0);
  const yearly = yearlyOpen ? Math.max(0, parseDecimal(yearlyDraft) || 0) : 0;
  const useOwnYield = ownYield || portfolioYield == null;
  const ownYieldValue = parseDecimal(yieldDraft);
  const yieldPercent = useOwnYield ? (Number.isFinite(ownYieldValue) ? ownYieldValue : null) : portfolioYield;
  const progress = goalPerMonth != null ? goalProgress(income, goalPerMonth, 'month') : null;
  const showChart =
    goalPerMonth != null && income < goalPerMonth && yieldPercent != null && yieldPercent > 0 && (income > 0 || monthly > 0 || yearly > 0);

  const toggleForecast = () => {
    const next = !forecastOpen;
    setForecastOpen(next);
    writeStorage(FORECAST_OPEN_KEY, next ? '1' : null);
  };

  const changeGoal = (draft: string) => {
    setGoalDraft(draft);
    const value = parseDecimal(draft);
    if (value > 0) schedule('goal', () => setIncomeGoal(value));
    else cancel('goal');
  };

  // An emptied field does not remove the goal (that is «Убрать цель»): it comes back on leaving the field.
  const leaveGoal = () => {
    flush();
    if (!(parseDecimal(goalDraft) > 0) && goal != null) setGoalDraft(draftOf(goal));
  };

  const changeMonthly = (draft: string) => {
    setMonthlyDraft(draft);
    schedule('monthly', () => setGoalPlan({ monthly: parseDecimal(draft) || 0 }));
  };

  const changeYearly = (draft: string) => {
    setYearlyDraft(draft);
    schedule('yearly', () => setGoalPlan({ yearly: parseDecimal(draft) || 0 }));
  };

  const removeYearly = () => {
    setYearlyOpen(false);
    setYearlyDraft('');
    schedule('yearly', () => setGoalPlan({ yearly: 0 }));
  };

  const changeYieldMode = (mode: 'portfolio' | 'own') => {
    if (mode === 'portfolio') {
      setOwnYield(false);
      schedule('yield', () => setGoalPlan({ customYield: null }));
      return;
    }
    setOwnYield(true);
    const draft = yieldDraft || (portfolioYield != null ? yieldDraftOf(portfolioYield) : '');
    setYieldDraft(draft);
    const value = parseDecimal(draft);
    if (Number.isFinite(value)) schedule('yield', () => setGoalPlan({ customYield: value }));
  };

  const changeYield = (raw: string) => {
    const draft = cleanYieldDraft(raw);
    setYieldDraft(draft);
    const value = parseDecimal(draft);
    if (Number.isFinite(value)) schedule('yield', () => setGoalPlan({ customYield: value }));
  };

  const removeGoal = async () => {
    const ok = await confirm({
      title: 'Убрать цель?',
      description: 'Пополнения и доходность для прогноза останутся.',
      confirmLabel: 'Убрать цель',
      destructive: true,
    });
    if (!ok) return;
    cancel('goal');
    await setIncomeGoal(null);
    setGoalDraft('');
    toast('Цель убрана');
  };

  return (
    <>
      <MissingRateNotice
        currencies={missingRates}
        description="Активы в этой валюте не попали в доход и прогноз."
        className="mb-4"
      />

      <Card className="px-4 pt-4 pb-4">
        <MoneyField
          id="goal-amount"
          label="Нужно в месяц"
          autoFocus={initialGoal == null}
          placeholder="150 000"
          value={goalDraft}
          onChange={changeGoal}
          onBlur={leaveGoal}
          hint={
            goalPerMonth != null
              ? `= ${formatIncome(goalPerMonth * 12)} в год · ${taxed ? 'после' : 'до'} НДФЛ, как главное число`
              : 'Например, ваши обычные расходы за месяц'
          }
        />
        {progress && (
          <>
            <GoalStrip progress={progress} className="mt-4" />
            <div className="mt-2 text-[length:var(--hi-text-caption)] text-[var(--hi-text-2)]">
              {progress.reached ? 'Цель достигнута' : `${progress.percent}% пути`} · портфель оплачивает {progress.coveredLabel}
            </div>
          </>
        )}
      </Card>

      {goalPerMonth != null && (
        <section className="mt-4">
          <button
            type="button"
            aria-expanded={forecastOpen}
            aria-controls="goal-forecast"
            onClick={toggleForecast}
            className="hi-pressable flex w-full items-center gap-3 rounded-[22px] border border-[var(--hi-line)] bg-[var(--hi-surface)] px-4 py-3.5 text-left active:bg-[var(--hi-raised)]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]">
              <TrendingUp className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">
                Когда портфель оплатит цель
              </span>
              <span className="mt-0.5 block text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                Прогноз с реинвестированием и пополнениями
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-5 shrink-0 text-[var(--hi-text-3)] transition-transform duration-300', forecastOpen && 'rotate-180')}
            />
          </button>

          {forecastOpen && (
            <div id="goal-forecast" className="animate-[hi-fade-slide-down_0.35s_var(--hi-ease-out)_both]">
              <Card glow className="mt-3 px-4 pt-5 pb-3">
                <GoalAnswer
                  goalPerMonth={goalPerMonth}
                  incomePerMonth={income}
                  yieldPercent={yieldPercent}
                  monthly={monthly}
                  yearly={yearly}
                />
                {showChart && (
                  <div className="mt-5">
                    <GoalForecastChart
                      goalPerMonth={goalPerMonth}
                      capital={portfolio.totalValue}
                      incomePerMonth={income}
                      yieldPercent={yieldPercent}
                      monthly={monthly}
                      yearly={yearly}
                    />
                  </div>
                )}
              </Card>

              <Section title="Доходность" className="mt-8">
                {portfolioYield != null && (
                  <Segmented
                    ariaLabel="Доходность для прогноза"
                    className="w-full"
                    value={useOwnYield ? 'own' : 'portfolio'}
                    onChange={changeYieldMode}
                    options={[
                      { value: 'portfolio', label: `Текущая · ${formatPercent(portfolioYield)}` },
                      { value: 'own', label: 'Своя' },
                    ]}
                  />
                )}
                {useOwnYield && (
                  <Field label="Своя доходность в год, после НДФЛ" htmlFor="goal-yield" className="mt-4">
                    <TextInput
                      id="goal-yield"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="8"
                      value={yieldDraft}
                      suffix="%"
                      onChange={(e) => changeYield(e.target.value)}
                      onBlur={flush}
                      onKeyDown={blurOnEnter}
                    />
                  </Field>
                )}
                <p className="mt-2 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
                  {portfolioYield == null
                    ? 'Стоимость портфеля неизвестна, поэтому текущей доходности нет — укажите свою.'
                    : useOwnYield
                      ? 'Попробуйте разные цифры: например, ставку вклада за вычетом налога. Текущая вернётся одним нажатием.'
                      : `Доход за последние 12 месяцев после НДФЛ ÷ капитал.${unpricedIncome ? ' Активы без цены не учтены.' : ''}`}
                </p>
              </Section>

              <Section title="Пополнения" className="mt-8">
                <MoneyField
                  id="goal-monthly"
                  label="Каждый месяц"
                  placeholder="0"
                  value={monthlyDraft}
                  onChange={changeMonthly}
                  onBlur={flush}
                  hint="Сколько готовы докладывать в портфель"
                />
                {yearlyOpen ? (
                  <MoneyField
                    id="goal-yearly"
                    label="Раз в год, дополнительно"
                    className="mt-4"
                    placeholder="0"
                    value={yearlyDraft}
                    onChange={changeYearly}
                    onBlur={flush}
                    hint={
                      <span className="flex items-baseline justify-between gap-3">
                        <span>Премия, вычет — в конце каждого года</span>
                        <button type="button" onClick={removeYearly} className="hi-pressable shrink-0 font-semibold text-[var(--hi-gold)]">
                          Убрать
                        </button>
                      </span>
                    }
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setYearlyOpen(true)}
                    className="hi-pressable mt-3 inline-flex items-center gap-1.5 px-1 py-1 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-gold)]"
                  >
                    <Plus className="size-4" /> Раз в год, дополнительно
                  </button>
                )}
              </Section>

              <div className="mt-8 flex items-start gap-2 px-1">
                <p className="min-w-0 flex-1 pt-1.5 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
                  Прогноз — ориентир, а не обещание. Все выплаты реинвестируются с той же доходностью, суммы — в сегодняшних деньгах.
                </p>
                <InfoLink section="goal" label="Как считается прогноз — в «Как устроен Рантье»" />
              </div>
            </div>
          )}
        </section>
      )}

      {goal != null && (
        <Button variant="ghost" size="md" block className="mt-6" onClick={removeGoal}>
          Убрать цель
        </Button>
      )}
    </>
  );
}
