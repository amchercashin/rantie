import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { Card, ListRow } from '@/components/ds/surface';
import { Field, TextInput, parseDecimal } from '@/components/ds/field';
import { cn, formatRate } from '@/lib/utils';

interface AccountNdflSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account's own rate, or undefined when the category rates apply. */
  rate: number | undefined;
  /** null returns the account to the category rates. */
  onSave: (rate: number | null) => void | Promise<void>;
}

const OPTIONS: { rate: number | null; title: string; subtitle: string }[] = [
  { rate: null, title: 'Как по категориям', subtitle: 'Ставки из настроек' },
  { rate: 0, title: '0%', subtitle: 'ИИС с налоговой льготой' },
  { rate: 4, title: '4%', subtitle: 'Аренда как самозанятый' },
  { rate: 13, title: '13%', subtitle: 'Дивиденды, купоны и вклады у большинства' },
  { rate: 15, title: '15%', subtitle: 'Доход больше 2,4 млн ₽ в год' },
];

const isPreset = (rate: number | undefined) => OPTIONS.some((o) => o.rate === (rate ?? null));

export function AccountNdflSheet({ open, onOpenChange, rate, onSave }: AccountNdflSheetProps) {
  const [draft, setDraft] = useState('');
  useEffect(() => {
    if (open) setDraft(rate != null && !isPreset(rate) ? String(rate).replace('.', ',') : '');
  }, [open, rate]);

  const custom = parseDecimal(draft);
  const customValid = Number.isFinite(custom) && custom >= 0 && custom <= 100;

  const save = async (value: number | null) => {
    await onSave(value);
    onOpenChange(false);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="НДФЛ по счёту"
      description="Одна ставка для всего дохода этого счёта. Она заменяет ставки по категориям из настроек."
    >
      <Card className="overflow-hidden">
        {OPTIONS.map((o) => {
          const selected = (rate ?? null) === o.rate;
          return (
            <ListRow
              key={o.title}
              title={<span className={cn(selected && 'font-semibold text-[var(--hi-gold)]')}>{o.title}</span>}
              subtitle={o.subtitle}
              trailing={selected ? <span className="inline-block size-2 rounded-full bg-[var(--hi-gold)]" /> : undefined}
              onClick={() => save(o.rate)}
            />
          );
        })}
      </Card>
      <div className="mt-4 flex items-end gap-2">
        <Field label="Своя ставка" className="min-w-0 flex-1">
          <TextInput
            inputMode="decimal"
            value={draft}
            placeholder={rate != null && !isPreset(rate) ? formatRate(rate) : 'Например, 6'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && customValid && save(custom)}
            suffix="%"
            aria-label="Своя ставка НДФЛ, %"
          />
        </Field>
        <Button variant="secondary" className="h-12" disabled={!customValid} onClick={() => save(custom)}>
          Сохранить
        </Button>
      </div>
    </BottomSheet>
  );
}
