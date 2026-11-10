import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { Field, TextInput, parseDecimal } from '@/components/ds/field';
import { GoalStrip } from '@/components/main/goal-path';
import { goalProgress } from '@/services/income-goal';
import { formatCurrencyFull, formatIncome } from '@/lib/utils';

interface GoalSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current goal per month, null when not set. */
  goalPerMonth: number | null;
  /** Net income per month right now — for the live preview. */
  incomePerMonth: number;
  /** Whether the hero number is after NDFL (wording only). */
  taxed: boolean;
  onSave: (goalPerMonth: number | null) => void | Promise<void>;
}

/** Thin spaces between thousands while typing: "150000" → "150 000". */
function groupDraft(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** The income goal: one number, with a live preview of how far along the portfolio already is. */
export function GoalSheet({ open, onOpenChange, goalPerMonth, incomePerMonth, taxed, onSave }: GoalSheetProps) {
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (open) setDraft(goalPerMonth ? groupDraft(String(Math.round(goalPerMonth))) : '');
  }, [open, goalPerMonth]);

  const value = parseDecimal(draft);
  const valid = Number.isFinite(value) && value > 0;
  const preview = valid ? goalProgress(incomePerMonth, value, 'month') : null;

  const save = async () => {
    if (!valid) return;
    await onSave(value);
    onOpenChange(false);
  };

  const remove = async () => {
    await onSave(null);
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Цель по доходу"
      description={`Сколько должно приходить в месяц, чтобы жить на доход с капитала. Считайте ${taxed ? 'после НДФЛ' : 'до НДФЛ'} — так же, как главное число.`}
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block disabled={!valid} onClick={save}>
            Сохранить
          </Button>
          {goalPerMonth != null && (
            <Button variant="ghost" size="md" block onClick={remove}>
              Убрать цель
            </Button>
          )}
        </div>
      }
    >
      <Field
        label="Нужно в месяц"
        htmlFor="income-goal"
        hint={valid ? `= ${formatIncome(value * 12)} в год` : 'Например, ваши обычные расходы за месяц'}
      >
        <TextInput
          id="income-goal"
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          placeholder="150 000"
          value={draft}
          suffix="₽"
          onChange={(e) => setDraft(groupDraft(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </Field>

      <div
        aria-live="polite"
        className="mt-5 rounded-2xl border border-[var(--hi-line)] bg-[var(--hi-surface)] px-4 py-3.5"
      >
        {preview ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="hi-eyebrow">Сейчас</span>
              <span className="text-[length:var(--hi-text-heading)] font-semibold text-[var(--hi-text)]">
                {preview.percent}%
                <span className="ml-1.5 text-[length:var(--hi-text-caption)] font-normal text-[var(--hi-text-3)]">
                  {preview.reached ? 'цель достигнута' : 'пути'}
                </span>
              </span>
            </div>
            <GoalStrip progress={preview} className="mt-2.5" />
            <div className="mt-2.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]">
              {preview.reached
                ? `Доход ${formatCurrencyFull(incomePerMonth)} в месяц уже покрывает эту цель.`
                : `Портфель приносит ${formatCurrencyFull(incomePerMonth)} в месяц и оплачивает ${preview.coveredLabel}. До цели — ещё ${formatCurrencyFull(value - incomePerMonth)} в месяц.`}
            </div>
          </>
        ) : (
          <div className="text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-3)]">
            Введите сумму — и увидите, сколько дней месяца портфель уже оплачивает.
          </div>
        )}
      </div>

      <p className="mt-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
        Цель хранится только на этом устройстве и попадает в бэкап.
      </p>
    </BottomSheet>
  );
}
