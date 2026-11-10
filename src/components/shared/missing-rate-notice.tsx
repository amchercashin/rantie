import { useState } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ds/button';
import { TextInput, parseDecimal } from '@/components/ds/field';
import { useFeedback } from '@/components/ds/feedback';
import { refreshExchangeRates, updateExchangeRate } from '@/services/exchange-rates';
import { cn } from '@/lib/utils';

interface MissingRateNoticeProps {
  /** Currencies without a rate to the ruble. Renders nothing when empty. */
  currencies: string[];
  /** What is left out without the rate, one sentence. */
  description: string;
  className?: string;
}

/**
 * Shown where a foreign-currency asset would otherwise silently count as 0 ₽:
 * loads the rate from MOEX or takes the user's own.
 */
export function MissingRateNotice({ currencies, description, className }: MissingRateNoticeProps) {
  const { toast } = useFeedback();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (currencies.length === 0) return null;

  const save = async (currency: string) => {
    const rate = parseDecimal(drafts[currency] ?? '');
    if (!(rate > 0)) return;
    await updateExchangeRate(currency, rate);
    toast(`Курс ${currency} сохранён`);
  };

  const loadFromMoex = async () => {
    setLoading(true);
    try {
      const { missing } = await refreshExchangeRates();
      if (missing.length === 0) toast('Курс загружен с Мосбиржи');
      else toast('Мосбиржа не ответила — укажите курс вручную', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="note"
      className={cn(
        'rounded-2xl border border-[rgba(217,192,142,0.22)] bg-[linear-gradient(135deg,rgba(217,192,142,0.10),rgba(217,192,142,0.03))] px-4 py-3',
        className,
      )}
    >
      <div className="flex gap-3">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--hi-gold)]" />
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">
            Нет курса {currencies.join(', ')}
          </div>
          <div className="mt-0.5 text-[length:var(--hi-text-caption)] leading-relaxed text-[var(--hi-text-2)]">
            {description} Курс подтягивается с Мосбиржи, можно указать и свой.
          </div>
          {currencies.map((currency) => {
            const draft = drafts[currency] ?? '';
            return (
              <div key={currency} className="mt-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <TextInput
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [currency]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(currency);
                    }}
                    placeholder="курс"
                    suffix={`₽ за ${currency}`}
                    aria-label={`Курс ${currency} к рублю`}
                    className="h-10 pr-24"
                  />
                </div>
                <Button variant="primary" size="sm" className="h-10" disabled={!(parseDecimal(draft) > 0)} onClick={() => save(currency)}>
                  Сохранить
                </Button>
              </div>
            );
          })}
          <Button variant="ghost" size="sm" icon={<RefreshCw />} loading={loading} onClick={loadFromMoex} className="-ml-3 mt-1.5">
            Загрузить с Мосбиржи
          </Button>
        </div>
      </div>
    </div>
  );
}
