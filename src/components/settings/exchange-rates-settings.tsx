import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { normalizeCurrency, resetExchangeRate, updateExchangeRate } from '@/services/exchange-rates';
import { Card, Section } from '@/components/ds/surface';
import { useFeedback } from '@/components/ds/feedback';

export function ExchangeRatesSettings() {
  const assets = useLiveQuery(() => db.assets.toArray(), [], []);
  const rates = useExchangeRates();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const { toast } = useFeedback();

  const currencies = new Set<string>();
  for (const asset of assets) {
    const currency = normalizeCurrency(asset.currency);
    if (currency !== 'RUB') currencies.add(currency);
  }
  for (const rate of rates) {
    const currency = normalizeCurrency(rate.currency);
    if (currency !== 'RUB') currencies.add(currency);
  }

  const rateByCurrency = new Map(rates.map((rate) => [normalizeCurrency(rate.currency), rate]));
  const sortedCurrencies = [...currencies].sort();

  const dropDraft = (currency: string) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[currency];
      return next;
    });

  // Only an edited value becomes the user's own rate: focusing the field and
  // leaving it must not freeze the MOEX rate as manual.
  const commit = async (currency: string) => {
    const raw = drafts[currency];
    if (raw == null) return;
    const parsed = Number(raw.replace(',', '.'));
    if (isFinite(parsed) && parsed > 0 && parsed !== rateByCurrency.get(currency)?.rateToRub) {
      await updateExchangeRate(currency, parsed);
    }
    dropDraft(currency);
  };

  const reset = async (currency: string) => {
    const ok = await resetExchangeRate(currency);
    if (ok) dropDraft(currency);
    toast(ok ? `Курс ${currency} снова с Мосбиржи` : 'Мосбиржа не ответила — попробуйте позже', ok ? 'success' : 'error');
  };

  return (
    <Section title="Курсы валют" description="Для пересчёта валютных активов в рубли. Подтягиваются с Мосбиржи; свой курс не перезаписывается.">
      <Card className="overflow-hidden px-4">
        {sortedCurrencies.length === 0 && (
          <div className="py-4 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]">
            Валютных активов нет. Курс появится здесь, когда вы добавите актив в долларах, евро или юанях.
          </div>
        )}
        {sortedCurrencies.map((currency) => {
          const rate = rateByCurrency.get(currency);
          const value = drafts[currency] ?? (rate ? String(rate.rateToRub) : '');
          return (
            <div key={currency} className="flex items-center justify-between gap-3 border-b border-[var(--hi-line)] py-3 last:border-b-0">
              <div>
                <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{currency}</div>
                {rate ? (
                  <div className="text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
                    {rate.source === 'moex' ? 'Мосбиржа' : 'свой курс'} · {rate.updatedAt.toLocaleDateString('ru-RU')}
                    {rate.source === 'manual' && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={() => reset(currency)}
                          className="hi-pressable font-semibold text-[var(--hi-gold)]"
                        >
                          с биржи
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-[length:var(--hi-text-micro)] text-[var(--hi-negative)]">нет курса — актив не в итоге</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [currency]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                  onBlur={() => commit(currency)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commit(currency);
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="курс"
                  aria-label={`Курс ${currency} к рублю`}
                  className="h-10 w-24 rounded-xl border border-[var(--hi-line)] bg-[var(--hi-void)] px-3 text-right text-base text-[var(--hi-text)] outline-none placeholder:text-[var(--hi-text-3)] focus:border-[var(--hi-gold-deep)]"
                />
                <span className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">₽</span>
              </div>
            </div>
          );
        })}
      </Card>
    </Section>
  );
}
