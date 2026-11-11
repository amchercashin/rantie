import { useState } from 'react';
import { X } from 'lucide-react';
import type { Platform } from '@/hooks/use-install-prompt';
import { IosInstallGuide } from '@/components/ios-install-guide';
import { BrandMark } from '@/components/ds/brand-mark';
import { Button } from '@/components/ds/button';
import { cn } from '@/lib/utils';

interface InstallCardProps {
  platform: Platform;
  /** Android: open the browser's install dialog. */
  onInstall: () => void;
  onDismiss: () => void;
  className?: string;
}

/**
 * Invitation to put the app on the phone's home screen. Sits in the page flow at the end of the
 * main page, so it never covers content. iPhone has no install dialog — the button opens a guide.
 */
export function InstallCard({ platform, onInstall, onDismiss, className }: InstallCardProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const ios = platform === 'ios';

  return (
    <>
      <aside
        aria-label="Установка приложения"
        className={cn('hi-card-glow relative flex gap-4 rounded-[22px] border border-[rgba(217,192,142,0.18)] p-4 pr-11', className)}
      >
        <BrandMark framed className="size-[52px] shrink-0" />
        <div className="min-w-0">
          <div className="font-serif text-[length:var(--hi-text-nav)] font-medium leading-tight text-[var(--hi-text)]">
            Рантье как приложение
          </div>
          <p className="mt-1.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]">
            {ios
              ? 'Иконка на экране «Домой» и работа без сети. И Safari не сотрёт портфель, если долго не заходить.'
              : 'Иконка на главном экране, запуск без адресной строки и работа без сети.'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={ios ? () => setGuideOpen(true) : onInstall}>
            {ios ? 'Как установить' : 'Установить'}
          </Button>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрыть"
          className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full text-[var(--hi-text-3)] active:bg-[var(--hi-raised)]"
        >
          <X className="size-4" />
        </button>
      </aside>

      {guideOpen && <IosInstallGuide onClose={() => setGuideOpen(false)} />}
    </>
  );
}
