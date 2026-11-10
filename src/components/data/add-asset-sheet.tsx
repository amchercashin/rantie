import { useEffect, useState } from 'react';
import { db } from '@/db/database';
import { addHolding } from '@/hooks/use-holdings';
import { getTypeSuggestions, getTypeColor } from '@/models/account';
import { useSyncContext } from '@/contexts/sync-context';
import { addAssetKindOf, buildAssetFromForm } from '@/services/add-asset-form';
import { refreshExchangeRates } from '@/services/exchange-rates';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { Field, TextInput, SelectInput, parseDecimal } from '@/components/ds/field';
import { useFeedback } from '@/components/ds/feedback';
import { cn, formatCurrencyFull, formatPrice } from '@/lib/utils';

interface AddAssetSheetProps {
  open: boolean;
  onClose: () => void;
  accountId: number;
  existingTypes: string[];
}

const CURRENCY_OPTIONS = ['RUB', 'USD', 'EUR', 'CNY'] as const;

const EMPTY = { name: '', ticker: '', quantity: '', cost: '', value: '', rate: '', rent: '', income: '', currency: 'RUB' };

export function AddAssetSheet({ open, onClose, accountId, existingTypes }: AddAssetSheetProps) {
  const { syncAsset } = useSyncContext();
  const { toast } = useFeedback();
  const [type, setType] = useState('Акции');
  const [f, setF] = useState(EMPTY);
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    if (open) {
      setF(EMPTY);
      setType('Акции');
    }
  }, [open]);

  const kind = addAssetKindOf(type);
  const suggestions = getTypeSuggestions(existingTypes);
  const unit = f.currency === 'RUB' ? '₽' : f.currency;
  const canSubmit = kind === 'security' ? f.ticker.trim() !== '' : f.name.trim() !== '';

  const quantity = parseDecimal(f.quantity);
  const cost = parseDecimal(f.cost);
  const value = parseDecimal(f.value);
  const rate = parseDecimal(f.rate);

  const handleAdd = async () => {
    if (!canSubmit) return;
    const { asset, quantity: qty, averagePrice } = buildAssetFromForm({
      type,
      name: f.name,
      ticker: f.ticker,
      currency: f.currency,
      quantity,
      totalCost: cost,
      value,
      ratePercent: rate,
      monthlyRent: parseDecimal(f.rent),
      annualIncome: parseDecimal(f.income),
    });

    // Re-use an existing security with the same ticker (shared across accounts).
    const existing = asset.ticker ? await db.assets.where('ticker').equals(asset.ticker).first() : undefined;
    const assetId = existing?.id ?? ((await db.assets.add(asset)) as number);

    await addHolding({ accountId, assetId, quantity: qty, quantitySource: 'manual', averagePrice });
    onClose();
    toast(`Добавлено: ${asset.name}`);
    if (kind === 'security') syncAsset(assetId); // fire-and-forget: price + payments from MOEX
    if (asset.currency !== 'RUB') void refreshExchangeRates(); // fire-and-forget: rate to the ruble from MOEX
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Новый актив"
      description="Для бумаг с Мосбиржи цена и выплаты подтянутся автоматически."
      footer={
        <Button variant="primary" size="lg" block disabled={!canSubmit} onClick={handleAdd}>
          Добавить
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-2 px-1 text-[length:var(--hi-text-caption)] font-medium text-[var(--hi-text-2)]">Категория</div>
          <div className="hi-scroll-hide -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Категория">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={type === s}
                onClick={() => setType(s)}
                className={cn(
                  'hi-pressable inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[length:var(--hi-text-caption)] font-semibold transition-colors',
                  type === s
                    ? 'border-[rgba(217,192,142,0.45)] bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]'
                    : 'border-[var(--hi-line)] bg-[var(--hi-surface)] text-[var(--hi-text-2)]',
                )}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: getTypeColor(s) }} />
                {s}
              </button>
            ))}
          </div>
        </div>

        {kind === 'security' && (
          <>
            <div className="grid grid-cols-[1fr_1.4fr] gap-3">
              <Field label="Тикер или ISIN">
                <TextInput value={f.ticker} onChange={set('ticker')} placeholder="SBER" autoCapitalize="characters" autoFocus />
              </Field>
              <Field label="Название">
                <TextInput value={f.name} onChange={set('name')} placeholder="необязательно" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Количество">
                <TextInput inputMode="decimal" value={f.quantity} onChange={set('quantity')} placeholder="100" suffix="шт" />
              </Field>
              <Field
                label="Куплено за"
                hint={quantity > 1 && cost > 0 ? `${formatPrice(cost / quantity)} за шт` : 'всего, необязательно'}
              >
                <TextInput inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="25 000" suffix="₽" />
              </Field>
            </div>
          </>
        )}

        {kind === 'deposit' && (
          <>
            <Field label="Название">
              <TextInput value={f.name} onChange={set('name')} placeholder="Вклад в Т-Банке" autoFocus />
            </Field>
            <div className="grid grid-cols-[1.4fr_1fr] gap-3">
              <Field label="Сумма вклада">
                <TextInput inputMode="decimal" value={f.value} onChange={set('value')} placeholder="500 000" suffix={unit} />
              </Field>
              <Field label="Ставка">
                <TextInput inputMode="decimal" value={f.rate} onChange={set('rate')} placeholder="18" suffix="%" />
              </Field>
            </div>
            {value > 0 && rate > 0 && (
              <div className="rounded-2xl bg-[var(--hi-gold-tint)] px-4 py-3 text-[length:var(--hi-text-caption)] text-[var(--hi-text-2)]">
                Доход ≈ <span className="font-semibold text-[var(--hi-gold)]">{formatCurrencyFull((value * rate) / 100 / 12)}</span> в месяц до НДФЛ
              </div>
            )}
          </>
        )}

        {kind === 'realty' && (
          <>
            <Field label="Название">
              <TextInput value={f.name} onChange={set('name')} placeholder="Студия на Ленина" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Стоимость объекта">
                <TextInput inputMode="decimal" value={f.value} onChange={set('value')} placeholder="6 500 000" suffix={unit} />
              </Field>
              <Field label="Аренда в месяц" hint="можно не указывать и записывать поступления">
                <TextInput inputMode="decimal" value={f.rent} onChange={set('rent')} placeholder="40 000" suffix={unit} />
              </Field>
            </div>
          </>
        )}

        {kind === 'other' && (
          <>
            <Field label="Название">
              <TextInput value={f.name} onChange={set('name')} placeholder="Например, золото" autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Количество">
                <TextInput inputMode="decimal" value={f.quantity} onChange={set('quantity')} placeholder="1" suffix="шт" />
              </Field>
              <Field label="Куплено за" hint={quantity > 1 && cost > 0 ? `${formatPrice(cost / quantity, f.currency)} за шт` : 'всего'}>
                <TextInput inputMode="decimal" value={f.cost} onChange={set('cost')} placeholder="25 000" suffix={unit} />
              </Field>
            </div>
            <Field label="Доход на 1 шт в год" hint="необязательно — можно записывать выплаты">
              <TextInput inputMode="decimal" value={f.income} onChange={set('income')} placeholder="0" suffix={unit} />
            </Field>
          </>
        )}

        {kind !== 'security' && (
          <Field label="Валюта">
            <SelectInput value={f.currency} onChange={set('currency')}>
              {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectInput>
          </Field>
        )}
      </div>
    </BottomSheet>
  );
}
