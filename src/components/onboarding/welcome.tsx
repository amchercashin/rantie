import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Bot, FileUp, Landmark, LineChart, Lock, PenLine, Sparkles } from 'lucide-react';
import { db } from '@/db/database';
import { BrandMark, Wordmark } from '@/components/ds/brand-mark';
import { Button } from '@/components/ds/button';
import { isWelcomeDone, markWelcomeDone } from '@/lib/hints';
import { loadDemoPortfolio } from '@/services/demo-portfolio';
import { withViewTransition } from '@/lib/view-transition';
import { cn } from '@/lib/utils';

const SLIDES = 4;

function Slide({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full shrink-0 snap-center snap-always flex-col items-center justify-center px-8 text-center">
      {children}
    </div>
  );
}

function SlideTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-[clamp(32px,9.5vw,42px)] font-medium leading-[1.05] text-[var(--hi-text)]">{children}</h2>;
}

function SlideText({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[330px] text-[length:var(--hi-text-body)] leading-relaxed text-[var(--hi-text-2)]">{children}</p>;
}

/** Decorative preview of the dynamics chart. */
function MiniChart() {
  return (
    <svg viewBox="0 0 260 90" className="mt-6 w-[260px]" aria-hidden="true">
      <defs>
        <linearGradient id="wl-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--hi-gold)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--hi-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0,78 L30,74 L60,70 L90,62 L120,60 L150,48 L170,44 L170,90 L0,90Z" fill="url(#wl-area)" />
      <path
        d="M0,78 L30,74 L60,70 L90,62 L120,60 L150,48 L170,44"
        fill="none" stroke="var(--hi-gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray="1" style={{ strokeDashoffset: 1, animation: 'hi-draw 1.4s var(--hi-ease-out) 0.2s forwards' }}
      />
      <path d="M170,44 L200,38 L230,30 L260,22" fill="none" stroke="var(--hi-gold)" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
      <circle cx="170" cy="44" r="8" fill="var(--hi-gold)" opacity="0.2" />
      <circle cx="170" cy="44" r="4" fill="var(--hi-gold-bright)" />
    </svg>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3.5 text-left">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--hi-line-strong)] bg-[var(--hi-surface)] text-[var(--hi-gold)] [&_svg]:size-[18px]">
        {icon}
      </div>
      <div>
        <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{title}</div>
        <div className="mt-0.5 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]">{text}</div>
      </div>
    </div>
  );
}

/**
 * First-launch welcome: what the app is about, then a choice of how to start
 * (import, manual, or a demo portfolio). Shown once; can be replayed from settings.
 */
export function Welcome() {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    if (isWelcomeDone()) return;
    let cancelled = false;
    db.accounts.count().then((count) => {
      if (cancelled) return;
      if (count > 0) markWelcomeDone();
      else setVisible(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Keep focus and screen readers inside the dialog while it is open.
  useEffect(() => {
    const root = document.getElementById('root');
    if (!visible || !root) return;
    root.inert = true;
    return () => { root.inert = false; };
  }, [visible]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => setIndex(Math.round(track.scrollLeft / Math.max(track.clientWidth, 1)));
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => track.removeEventListener('scroll', onScroll);
  }, [visible]);

  if (!visible) return null;

  const goTo = (i: number) => {
    const track = trackRef.current;
    track?.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  };

  const finish = (then?: () => void | Promise<void>) => {
    markWelcomeDone();
    setClosing(true);
    setTimeout(async () => {
      setVisible(false);
      await then?.();
    }, 380);
  };

  // The first screen after the welcome is always Доход, whatever link the app was opened with.
  const goHome = () => {
    if (pathname !== '/') navigate('/', { replace: true });
  };

  const openData = (action: 'import' | 'add-account') =>
    finish(() => withViewTransition(() => navigate('/data', { state: { action } }), 'tab'));

  const last = index === SLIDES - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Добро пожаловать в Рантье"
      className={cn(
        'fixed inset-0 z-[60] flex flex-col bg-[radial-gradient(120%_70%_at_50%_20%,#1d1914_0%,var(--hi-void)_65%)] transition-all duration-400',
        closing ? 'opacity-0 scale-[1.02]' : 'animate-[hi-fade-in_0.5s_ease-out_both]',
      )}
      style={{ paddingTop: 'var(--hi-safe-top)', paddingBottom: 'var(--hi-safe-bottom)' }}
    >
      <div className="flex h-14 shrink-0 items-center justify-end px-4">
        {!last && (
          <button
            type="button"
            onClick={() => goTo(SLIDES - 1)}
            className="rounded-full px-3 py-2 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-3)] active:bg-[var(--hi-surface)]"
          >
            Пропустить
          </button>
        )}
      </div>

      <div ref={trackRef} className="hi-scroll-hide flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        <Slide>
          <div className="relative">
            <div className="absolute inset-0 -m-10 rounded-full bg-[radial-gradient(closest-side,var(--hi-gold-glow),transparent)] animate-[hi-glow-breathe_5s_ease-in-out_infinite]" />
            <BrandMark framed className="relative size-28 drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] animate-[hi-fade-scale-in_0.9s_var(--hi-ease-out)_both]" />
          </div>
          <div className="mt-10">
            <SlideTitle>
              <Wordmark inherit />
            </SlideTitle>
          </div>
          <SlideText>
            Учёт пассивного дохода. Не котировки и не «плюс-минус за день», а деньги, которые капитал приносит вам каждый месяц.
          </SlideText>
        </Slide>

        <Slide>
          <div className="hi-eyebrow">пассивный доход в месяц</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="hi-numerals-oldstyle font-serif text-[64px] font-light leading-none bg-[linear-gradient(180deg,var(--hi-gold-bright),var(--hi-gold-deep))] bg-clip-text text-transparent">
              47 054
            </span>
            <span className="text-[32px] font-light text-[var(--hi-gold-deep)]">₽</span>
          </div>
          <MiniChart />
          <div className="mt-8">
            <SlideTitle>Главное — одно число</SlideTitle>
          </div>
          <SlideText>
            Дивиденды, купоны, аренда и проценты по вкладам — в одной сумме, с учётом НДФЛ по вашей ставке. Плюс история и прогноз: как рос доход и каким он будет.
          </SlideText>
        </Slide>

        <Slide>
          <SlideTitle>Считается само</SlideTitle>
          <div className="mt-8 w-full max-w-[330px] space-y-5">
            <Feature icon={<LineChart />} title="Биржевые бумаги" text="Цены и выплаты подтягиваются сами: Мосбиржа, dohod.ru, фонды «Парус». Прогнозы дивидендов — тоже." />
            <Feature icon={<Landmark />} title="Вклады и недвижимость" text="Укажите доход в год или записывайте поступления — месячный доход посчитается сам." />
            <Feature icon={<Lock />} title="Портфель видите только вы" text="Без регистрации и без нашего сервера: счета и суммы хранятся на этом устройстве. Бэкап — одним файлом." />
          </div>
        </Slide>

        <Slide>
          <SlideTitle>С чего начнём?</SlideTitle>
          <SlideText>Добавить данные можно в любой момент во вкладке «Счета».</SlideText>
          <div className="mt-8 w-full max-w-[340px] space-y-2.5">
            <Button variant="primary" size="lg" block icon={<FileUp />} onClick={() => openData('import')}>
              Импорт отчёта брокера
            </Button>
            <div className="flex items-center justify-center gap-1.5 pb-1 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
              <Bot className="size-3.5" /> Отчёт Сбера или любой другой через ИИ-ассистента
            </div>
            <Button variant="secondary" size="lg" block icon={<PenLine />} onClick={() => openData('add-account')}>
              Добавить вручную
            </Button>
            <Button variant="ghost" size="lg" block icon={<Sparkles />} onClick={() => finish(() => { void loadDemoPortfolio(); goHome(); })}>
              Посмотреть на демо-портфеле
            </Button>
          </div>
        </Slide>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 px-6 pb-6 pt-2">
        <div className="flex gap-2" role="tablist" aria-label="Шаги">
          {Array.from({ length: SLIDES }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Шаг ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === index ? 'w-6 bg-[var(--hi-gold)]' : 'w-1.5 bg-[var(--hi-line-strong)]',
              )}
            />
          ))}
        </div>
        {!last ? (
          <Button variant="outline" size="md" onClick={() => goTo(index + 1)} className="pl-5">
            Далее <ArrowRight />
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => finish(goHome)}
            className="px-2 py-2 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-3)]"
          >
            Позже
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
