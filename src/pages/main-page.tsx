import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileUp, PenLine, ShieldCheck, Sparkles, X } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { SyncButton } from '@/components/layout/sync-button';
import { IncomeHero, type IncomePeriod } from '@/components/main/income-hero';
import { IncomeDynamicsChart } from '@/components/main/income-dynamics-chart';
import { UpcomingPayments } from '@/components/main/upcoming-payments';
import { IncomeStructure } from '@/components/main/income-structure';
import { GoalPath } from '@/components/main/goal-path';
import { GoalSheet } from '@/components/main/goal-sheet';
import { Wordmark } from '@/components/ds/brand-mark';
import { Section, EmptyState } from '@/components/ds/surface';
import { Button } from '@/components/ds/button';
import { Hint } from '@/components/ds/hint';
import { useFeedback } from '@/components/ds/feedback';
import { TransitionLink } from '@/components/ui/transition-link';
import { usePortfolioStats } from '@/hooks/use-portfolio-stats';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useDemoAccountId } from '@/hooks/use-demo';
import { useBackupReminder } from '@/hooks/use-backup-reminder';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { useIncomeGoal } from '@/hooks/use-income-goal';
import { setIncomeGoal } from '@/services/income-goal';
import { InstallButton } from '@/components/install-button';
import { upcomingPayments } from '@/services/income-projection';
import { loadDemoPortfolio, removeDemoPortfolio } from '@/services/demo-portfolio';
import { withViewTransition } from '@/lib/view-transition';

const PERIOD_KEY = 'rt-income-period';
let hasVisitedMainPage = false;

function readPeriod(): IncomePeriod {
  try {
    return localStorage.getItem(PERIOD_KEY) === 'year' ? 'year' : 'month';
  } catch {
    return 'month';
  }
}

export function MainPage() {
  const [mode, setMode] = useState<IncomePeriod>(readPeriod);
  const { portfolio, categories, assets, projection, timeline, isLoading } = usePortfolioStats({ withTimeline: true });
  const animate = useRef(!hasVisitedMainPage).current;
  const install = useInstallPrompt();
  const demoAccountId = useDemoAccountId();
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const backup = useBackupReminder();
  const ndflRates = useNdflRates();
  const goal = useIncomeGoal();
  const [goalOpen, setGoalOpen] = useState(false);
  // The hero promises "after tax" only when some rate is actually set for the categories held.
  const taxed = categories.some((c) => (ndflRates.get(c.type) ?? 0) > 0);

  useEffect(() => { hasVisitedMainPage = true; }, []);

  const changeMode = (next: IncomePeriod) => {
    setMode(next);
    try { localStorage.setItem(PERIOD_KEY, next); } catch { /* ignore */ }
  };

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id!, a])), [assets]);
  const upcoming = useMemo(() => upcomingPayments(projection, new Date(), 4), [projection]);

  const income = mode === 'month' ? portfolio.totalIncomePerMonth : portfolio.totalIncomePerYear;
  const isEmpty = !isLoading && categories.length === 0;

  const goToData = (action: 'import' | 'add-account') =>
    withViewTransition(() => navigate('/data', { state: { action } }), 'tab');

  const startDemo = async () => {
    await loadDemoPortfolio();
    toast('Демо-портфель загружен');
  };

  const endDemo = async () => {
    const ok = await confirm({
      title: 'Удалить демо-портфель?',
      description: 'Будут удалены только демонстрационные данные. Ваши счета останутся.',
      confirmLabel: 'Удалить демо',
      destructive: true,
    });
    if (!ok) return;
    await removeDemoPortfolio();
    toast('Демо-данные удалены');
  };

  return (
    <AppShell headerLeft={<Wordmark />} actions={!isEmpty && <SyncButton />}>
      {demoAccountId != null && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[rgba(143,176,201,0.22)] bg-[var(--hi-info-tint)] px-4 py-2.5 animate-[hi-fade-slide-down_0.4s_var(--hi-ease-out)_both]">
          <Sparkles className="size-4 shrink-0 text-[var(--hi-info)]" />
          <div className="min-w-0 flex-1 text-[length:var(--hi-text-caption)] text-[var(--hi-text-2)]">
            Вы смотрите <span className="font-semibold text-[var(--hi-text)]">демо-портфель</span>
          </div>
          <button
            type="button"
            onClick={endDemo}
            className="hi-pressable inline-flex items-center gap-1 rounded-full px-2 py-1 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-info)] active:bg-[rgba(143,176,201,0.15)]"
          >
            <X className="size-3.5" /> Удалить
          </button>
        </div>
      )}

      {backup.show && !isEmpty && (
        <div
          role="note"
          className="mb-4 rounded-2xl border border-[rgba(217,192,142,0.22)] bg-[linear-gradient(135deg,rgba(217,192,142,0.10),rgba(217,192,142,0.03))] px-4 py-3 animate-[hi-fade-slide-down_0.4s_var(--hi-ease-out)_both]"
        >
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--hi-gold)]" />
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">Сохраните бэкап</div>
              <div className="mt-0.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]">
                Портфель хранится только на этом устройстве. Файл бэкапа вернёт всё, если телефон сменится или браузер очистит данные.
              </div>
              <div className="mt-2.5 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Download />}
                  onClick={async () => {
                    await backup.download();
                    toast('Бэкап сохранён');
                  }}
                >
                  Скачать бэкап
                </Button>
                <Button variant="ghost" size="sm" onClick={backup.later}>
                  Позже
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          icon={<Sparkles />}
          title="Капитал, который платит"
          description="Добавьте активы — и здесь появится главное число: сколько денег в месяц приносит ваш портфель."
          className="pt-16"
        >
          <Button variant="primary" size="lg" block icon={<FileUp />} onClick={() => goToData('import')}>
            Импорт отчёта брокера
          </Button>
          <Button variant="secondary" size="lg" block icon={<PenLine />} onClick={() => goToData('add-account')}>
            Добавить вручную
          </Button>
          <Button variant="ghost" size="md" block onClick={startDemo}>
            Посмотреть на демо-портфеле
          </Button>
        </EmptyState>
      ) : (
        <>
          <IncomeHero
            income={isLoading ? null : income}
            incomePerYear={isLoading ? null : portfolio.totalIncomePerYear}
            yieldPercent={portfolio.yieldPercent}
            totalValue={portfolio.totalValue}
            mode={mode}
            onModeChange={changeMode}
            animate={animate}
            taxed={taxed}
            footer={
              <GoalPath
                incomePerMonth={isLoading ? null : portfolio.totalIncomePerMonth}
                goalPerMonth={goal}
                mode={mode}
                animate={animate}
                onEdit={() => setGoalOpen(true)}
              />
            }
          />
          <GoalSheet
            open={goalOpen}
            onOpenChange={setGoalOpen}
            goalPerMonth={goal ?? null}
            incomePerMonth={portfolio.totalIncomePerMonth ?? 0}
            taxed={taxed}
            onSave={async (next) => {
              const had = goal != null;
              await setIncomeGoal(next);
              toast(next == null ? 'Цель убрана' : had ? 'Цель обновлена' : 'Цель поставлена');
            }}
          />

          <div className="mt-8" style={animate ? { animation: 'hi-fade-slide-up 0.7s var(--hi-ease-out) 0.65s both' } : undefined}>
            <Hint id="main-pockets" title="Как считается доход">
              Дивиденды и купоны раскладываются на 12 месяцев, аренда и вклады — на свой период. Так доход в месяц
              не скачет от выплаты к выплате.
            </Hint>
          </div>

          {timeline.length > 0 && (
            <div className="mt-4" style={animate ? { animation: 'hi-fade-slide-up 0.7s var(--hi-ease-out) 0.7s both' } : undefined}>
              <IncomeDynamicsChart points={timeline} mode={mode} animate={animate} />
            </div>
          )}

          {upcoming.length > 0 && (
            <Section
              title="Ближайшие выплаты"
              className="mt-8"
              action={
                <TransitionLink
                  to="/payments"
                  direction="tab"
                  className="text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-gold)]"
                >
                  Календарь
                </TransitionLink>
              }
            >
              <UpcomingPayments payments={upcoming} assetsById={assetsById} />
            </Section>
          )}

          <Section title="Откуда доход" className="mt-8">
            <IncomeStructure categories={categories} mode={mode} animate={animate} />
          </Section>
        </>
      )}

      {install.showButton && (
        <InstallButton
          platform={install.platform}
          autoLaunchGuide={install.autoLaunchGuide}
          onInstall={install.promptInstall}
          onDismiss={install.dismiss}
          onIosSeen={install.markIosSeen}
        />
      )}
    </AppShell>
  );
}
