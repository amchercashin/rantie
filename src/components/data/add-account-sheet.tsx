import { useEffect, useState } from 'react';
import { FileUp } from 'lucide-react';
import { addAccount } from '@/hooks/use-accounts';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { Field, TextInput } from '@/components/ds/field';
import { useFeedback } from '@/components/ds/feedback';
import { cn } from '@/lib/utils';

interface AddAccountSheetProps {
  open: boolean;
  onClose: () => void;
  onImport?: () => void;
  /** Called with the new account id after creation. */
  onCreated?: (id: number) => void;
}

const PRESETS = ['Брокерский счёт', 'ИИС', 'Вклады', 'Недвижимость'];

export function AddAccountSheet({ open, onClose, onImport, onCreated }: AddAccountSheetProps) {
  const [name, setName] = useState('');
  const { toast } = useFeedback();

  useEffect(() => {
    if (open) setName('');
  }, [open]);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = await addAccount(trimmed);
    onClose();
    toast(`Счёт «${trimmed}» создан`);
    onCreated?.(id);
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Новый счёт"
      description="Счёт — это просто папка для активов: брокерский счёт, вклады, недвижимость."
      footer={
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" block disabled={!name.trim()} onClick={handleAdd}>
            Создать пустой
          </Button>
          <Button variant="secondary" size="lg" block icon={<FileUp />} onClick={() => { onClose(); onImport?.(); }}>
            Создать из отчёта брокера
          </Button>
        </div>
      }
    >
      <Field label="Название">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Сбер / Недвижимость / Вклады / Прочее"
          autoFocus
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setName(p)}
            className={cn(
              'hi-pressable rounded-full border px-3 py-1.5 text-[length:var(--hi-text-caption)] font-medium',
              name === p ? 'border-[rgba(217,192,142,0.45)] text-[var(--hi-gold)]' : 'border-[var(--hi-line)] text-[var(--hi-text-3)]',
            )}
          >
            {p}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
