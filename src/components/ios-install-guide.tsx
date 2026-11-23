import { useState, useCallback } from 'react';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { cn } from '@/lib/utils';

interface IosInstallGuideProps {
  onClose: () => void;
}

const TOTAL_STEPS = 4;

const BASE = import.meta.env.BASE_URL;

const fingerStyle: React.CSSProperties = {
  position: 'absolute',
  fontSize: 28,
  pointerEvents: 'none',
  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
};

/* ── Step screenshots + finger positions ── */

const STEPS: {
  src: string;
  alt: string;
  caption: string;
  /** Finger position as CSS properties (top/bottom/left/right in %) */
  finger: React.CSSProperties;
}[] = [
  {
    src: `${BASE}a2hs/step1-toolbar.jpg`,
    alt: 'Панель Safari с кнопкой ⋯',
    caption: 'Нажмите «⋯» в панели Safari',
    finger: { bottom: '3%', right: '6%' },
  },
  {
    src: `${BASE}a2hs/step2-menu.jpg`,
    alt: 'Меню Safari с пунктом Поделиться',
    caption: 'Нажмите «Поделиться»',
    finger: { top: '6%', right: '32%' },
  },
  {
    src: `${BASE}a2hs/step3-share.jpg`,
    alt: 'Share sheet с пунктом На экран Домой',
    caption: 'Выберите «Добавить на экран Домой»',
    finger: { bottom: '18%', left: '62%' },
  },
  {
    src: `${BASE}a2hs/step4-confirm.jpg`,
    alt: 'Экран подтверждения с кнопкой Добавить',
    caption: 'Нажмите «Добавить»',
    finger: { top: '8%', right: '6%' },
  },
];

export function IosInstallGuide({ onClose }: IosInstallGuideProps) {
  const [step, setStep] = useState(0);

  const advance = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, onClose]);

  const current = STEPS[step];
  const isLast = step >= TOTAL_STEPS - 1;

  return (
    <BottomSheet
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="На экран «Домой»"
      description={`Шаг ${step + 1} из ${TOTAL_STEPS}: ${current.caption}`}
      footer={
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)} className="flex-1">
              Назад
            </Button>
          )}
          <Button variant="primary" size="lg" onClick={advance} className={step > 0 ? 'flex-[2]' : 'w-full'}>
            {isLast ? 'Готово' : 'Далее'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          onClick={advance}
          className="relative cursor-pointer overflow-hidden rounded-2xl border border-[var(--hi-line)]"
        >
          <img
            src={current.src}
            alt={current.alt}
            className="block h-auto w-full"
          />
          <span
            aria-hidden="true"
            className="animate-[a2hs-tap_2s_ease-in-out_infinite]"
            style={{ ...fingerStyle, ...current.finger }}
          >
            👆
          </span>
        </div>

        <div className="text-center text-[length:var(--hi-text-body)] font-medium text-[var(--hi-gold)]">
          {current.caption}
        </div>

        <div className="flex justify-center gap-2 pb-1" role="tablist" aria-label="Шаги установки">
          {STEPS.map((s, i) => (
            <button
              key={s.src}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Шаг ${i + 1}`}
              onClick={() => setStep(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-6 bg-[var(--hi-gold)]' : 'w-1.5 bg-[var(--hi-line-strong)]',
              )}
            />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
