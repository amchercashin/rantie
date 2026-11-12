import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Info, Plus, RefreshCw } from 'lucide-react';
import type { Asset, PaymentHistory } from '@/models/types';
import { getTypeColor } from '@/models/account';
import { AssetAvatar } from '@/components/ds/surface';
import { SourceBadge, type SourceKind } from '@/components/ds/badge';
import { useFeedback } from '@/components/ds/feedback';
import { PaymentRow } from './payment-row';
import { AddPaymentForm } from './add-payment-form';
import { deletePayment, addPayment } from '@/hooks/use-payment-history';
import { updateAsset } from '@/hooks/use-assets';
import { isSyncable, syncAssetPayments } from '@/services/moex-sync';
import { assetSyncMessage } from '@/lib/payment-sync-message';
import { cn, plural } from '@/lib/utils';

const PAYMENT_TYPE_MAP: Record<string, PaymentHistory['type']> = {
  'Акции': 'dividend',
  'Облигации': 'coupon',
  'Недвижимость': 'rent',
  'Вклады': 'interest',
  'Фонды': 'distribution',
};

interface AssetPaymentsProps {
  asset: Asset;
  payments: PaymentHistory[];
  isHighlighted?: boolean;
}

export function AssetPayments({ asset, payments, isHighlighted }: AssetPaymentsProps) {
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [expanded, setExpanded] = useState(!!isHighlighted);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { confirm, toast } = useFeedback();

  useEffect(() => {
    if (!isHighlighted) return;
    setExpanded(true);
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [isHighlighted]);

  const sorted = [...payments].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const paymentType = PAYMENT_TYPE_MAP[asset.type] ?? 'other';
  const syncable = isSyncable(asset);
  const manualCount = payments.filter((p) => p.dataSource === 'manual').length;
  const source: SourceKind | null = syncFailed
    ? 'error'
    : payments.length === 0
      ? null
      : manualCount > 0
        ? 'manual'
        : // The stock's source is the one of its payments: under dohod.ru, smart-lab may add forecasts.
          ((payments.find((p) => !p.isForecast) ?? payments[0]).dataSource as SourceKind);

  const handleSync = async () => {
    if (syncing) return;
    if (manualCount > 0) {
      const ok = await confirm({
        title: 'Загрузить выплаты заново?',
        description: `Ручные выплаты (${manualCount}) заменятся загруженными. Если источники ничего не найдут, ручные останутся.`,
        confirmLabel: 'Загрузить',
      });
      if (!ok) return;
    }
    setSyncing(true);
    setSyncFailed(false);
    try {
      const result = await syncAssetPayments(asset.id!, { replaceManual: manualCount > 0 });
      if (!result.success) setSyncFailed(true);
      const message = assetSyncMessage(asset.ticker ?? asset.name, result, {
        hadManual: manualCount > 0,
        hadPayments: payments.length > 0,
      });
      toast(message.text, message.tone);
    } catch {
      setSyncFailed(true);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id: number) => {
    await deletePayment(id);
    toast('Выплата удалена', 'info');
  };

  return (
    <div
      ref={ref}
      className={cn(
        'relative after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden',
        isHighlighted && 'animate-highlight-pulse',
      )}
    >
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="hi-pressable flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-[var(--hi-raised)]"
        >
          <AssetAvatar label={asset.ticker ?? asset.name} color={getTypeColor(asset.type)} className="size-9 text-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[length:var(--hi-text-body)] font-medium text-[var(--hi-text)]">{asset.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
              <span>
                {payments.length} {plural(payments.length, ['выплата', 'выплаты', 'выплат'])}
              </span>
              {source && <SourceBadge source={source} />}
            </div>
          </div>
          <ChevronDown className={cn('size-4 shrink-0 text-[var(--hi-text-3)] transition-transform duration-300', expanded && 'rotate-180')} />
        </button>
        {syncable && (
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            aria-label={`Загрузить выплаты ${asset.ticker ?? asset.name} с биржи`}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--hi-text-2)] active:bg-[var(--hi-raised)]"
          >
            <RefreshCw className={cn('size-4', syncing && 'animate-spin text-[var(--hi-gold)]')} />
          </button>
        )}
        <button
          type="button"
          onClick={() => { setExpanded(true); setAddFormOpen((v) => !v); }}
          aria-label={`Добавить выплату: ${asset.name}`}
          className="mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--hi-gold)] active:bg-[var(--hi-gold-tint)]"
        >
          <Plus className="size-5" />
        </button>
      </div>

      {expanded && (
        <div className="pb-2 animate-[hi-fade-in_0.25s_ease-out_both]">
          {asset.paymentPerUnitSource === 'manual' && (
            <div className="mx-4 mb-2 flex items-start gap-2.5 rounded-2xl bg-[var(--hi-gold-tint)] px-3.5 py-2.5 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-2)]">
              <Info className="mt-0.5 size-4 shrink-0 text-[var(--hi-gold)]" />
              <span>
                Для этого актива задана своя сумма дохода — записи ниже на доход не влияют.{' '}
                <button
                  type="button"
                  onClick={() => updateAsset(asset.id!, { paymentPerUnitSource: 'fact', paymentPerUnit: undefined })}
                  className="font-semibold text-[var(--hi-gold)] underline-offset-2 hover:underline"
                >
                  Считать по выплатам
                </button>
              </span>
            </div>
          )}
          {addFormOpen && (
            <AddPaymentForm
              assetId={asset.id!}
              paymentType={paymentType}
              currency={asset.currency ?? 'RUB'}
              onAdd={async (p) => {
                await addPayment(p);
                setAddFormOpen(false);
                toast('Выплата добавлена');
              }}
              onCancel={() => setAddFormOpen(false)}
            />
          )}
          {sorted.length > 0 ? (
            <div className="max-h-[360px] overflow-y-auto">
              {sorted.map((p) => (
                <PaymentRow key={p.id} payment={p} currency={asset.currency ?? 'RUB'} onDelete={handleDelete} />
              ))}
            </div>
          ) : (
            !addFormOpen && (
              <div className="px-4 py-3 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                Выплат пока нет. {!syncable
                  ? 'Добавьте поступление кнопкой «+».'
                  : paymentType === 'coupon'
                    ? 'Загрузите их с биржи или добавьте вручную.'
                    : `Кнопка ⟳ загрузит их, если ${paymentType === 'distribution' ? 'фонд' : 'бумага'} есть в открытых источниках (${paymentType === 'distribution' ? 'фонды «Паруса»' : 'dohod.ru, smart-lab'}). Если нет — добавьте выплаты вручную кнопкой «+».`}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
