import { useRegisterSW } from 'virtual:pwa-register/react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ds/button';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // The browser looks for a new version only when the page is loaded. An installed app is
      // rarely loaded anew — it comes back from the background for days — so look on every return.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          registration.update().catch(() => { /* offline or the server is unreachable — next time */ });
        }
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(12px,var(--hi-safe-top))] z-[65] mx-auto flex max-w-[520px] items-center gap-3 rounded-[22px] border border-[rgba(217,192,142,0.25)] bg-[var(--hi-raised)]/95 py-2.5 pl-4 pr-2 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9)] backdrop-blur-xl animate-[hi-fade-slide-down_0.4s_var(--hi-ease-out)_both]"
    >
      <Sparkles className="size-4 shrink-0 text-[var(--hi-gold)]" />
      <p className="min-w-0 flex-1 text-[length:var(--hi-text-body)] text-[var(--hi-text)]">Доступна новая версия</p>
      <Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>Позже</Button>
      <Button variant="primary" size="sm" onClick={() => updateServiceWorker(true)}>Обновить</Button>
    </div>
  );
}
