import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, Landmark, Settings2, Sparkles, type LucideIcon } from 'lucide-react';
import { withViewTransition } from '@/lib/view-transition';
import { cn } from '@/lib/utils';

interface Tab {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Routes nested under this tab. */
  match: (path: string) => boolean;
}

export const TABS: Tab[] = [
  {
    path: '/',
    label: 'Доход',
    icon: Sparkles,
    match: (p) => p === '/' || p.startsWith('/category') || p.startsWith('/asset') || p.startsWith('/goal'),
  },
  { path: '/payments', label: 'Выплаты', icon: CalendarDays, match: (p) => p.startsWith('/payments') },
  { path: '/data', label: 'Счета', icon: Landmark, match: (p) => p.startsWith('/data') },
  { path: '/settings', label: 'Настройки', icon: Settings2, match: (p) => p.startsWith('/settings') },
];

export function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Разделы"
      className="hi-glass fixed inset-x-0 bottom-0 z-40 border-t border-[var(--hi-line)]"
      style={{ viewTransitionName: 'hi-tabbar', paddingBottom: 'var(--hi-safe-bottom)' }}
    >
      <div className="mx-auto grid h-[var(--hi-tabbar-h)] max-w-[560px] grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <button
              key={tab.path}
              type="button"
              data-tab={tab.path}
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                if (pathname === tab.path) {
                  document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
                  return;
                }
                withViewTransition(() => navigate(tab.path), 'tab');
              }}
              className="group relative flex flex-col items-center justify-center gap-1 outline-none"
            >
              <span
                className={cn(
                  'absolute top-0 h-[2px] w-8 rounded-full bg-[var(--hi-gold)] transition-all duration-300 ease-[var(--hi-ease-out)]',
                  active ? 'opacity-100 scale-x-100 shadow-[0_0_12px_var(--hi-gold-glow)]' : 'opacity-0 scale-x-0',
                )}
              />
              <Icon
                strokeWidth={active ? 2 : 1.6}
                className={cn(
                  'size-[22px] transition-all duration-200 group-active:scale-90',
                  active ? 'text-[var(--hi-gold)]' : 'text-[var(--hi-text-3)]',
                )}
              />
              <span
                className={cn(
                  'text-[10.5px] font-semibold tracking-[0.02em] transition-colors',
                  active ? 'text-[var(--hi-gold)]' : 'text-[var(--hi-text-3)]',
                )}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
