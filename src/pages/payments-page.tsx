import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { TypeSection } from '@/components/payments/type-section';
import { CashFlowCalendar } from '@/components/payments/cash-flow-calendar';
import { Segmented } from '@/components/ds/segmented';
import { EmptyState } from '@/components/ds/surface';
import { Hint } from '@/components/ds/hint';
import { SyncGlyph } from '@/components/ds/sync-glyph';
import { TransitionLink } from '@/components/ui/transition-link';
import { guidePath } from '@/lib/guide';
import { useAllPaymentHistory } from '@/hooks/use-payment-history';
import { usePortfolioStats } from '@/hooks/use-portfolio-stats';
import { bucketByMonth } from '@/services/income-projection';
import type { Asset, PaymentHistory } from '@/models/types';

type View = 'calendar' | 'history';

export function PaymentsPage() {
  const { portfolio, assets, projection, isLoading } = usePortfolioStats();
  const allPayments = useAllPaymentHistory();
  const taxed = portfolio.taxed;
  const location = useLocation();
  const [highlightAssetId] = useState(() => (location.state as { highlightAssetId?: number } | null)?.highlightAssetId);
  const [view, setView] = useState<View>(highlightAssetId != null ? 'history' : 'calendar');

  const paymentsByAsset = useMemo(() => {
    const map = new Map<number, PaymentHistory[]>();
    for (const p of allPayments) {
      // Zero-amount forecasts only mean "no dividend expected" — not a row to show.
      if (p.isForecast && p.amount <= 0) continue;
      const arr = map.get(p.assetId) ?? [];
      arr.push(p);
      map.set(p.assetId, arr);
    }
    return map;
  }, [allPayments]);

  const typeGroups = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const asset of assets) {
      const group = map.get(asset.type) ?? [];
      group.push(asset);
      map.set(asset.type, group);
    }
    return map;
  }, [assets]);

  const assetsById = useMemo(() => new Map(assets.map((a) => [a.id!, a])), [assets]);
  const buckets = useMemo(() => bucketByMonth(projection), [projection]);
  const isEmpty = !isLoading && assets.length === 0;

  return (
    <AppShell title="Выплаты" subtitle={!isEmpty && 'Когда и сколько денег придёт — и история по каждому активу'}>
      {isEmpty ? (
        <EmptyState icon={<CalendarDays />} title="Пока нет выплат" description="Добавьте активы во вкладке «Счета» — дивиденды и купоны подтянутся с биржи." />
      ) : (
        <>
          <div className="mb-5 flex justify-center">
            <Segmented
              value={view}
              onChange={setView}
              ariaLabel="Вид"
              className="w-full max-w-[320px]"
              options={[
                { value: 'calendar', label: 'Календарь' },
                { value: 'history', label: 'История' },
              ]}
            />
          </div>

          {view === 'calendar' ? (
            <div key="calendar" className="animate-[hi-fade-slide-up_0.4s_var(--hi-ease-out)_both]">
              <CashFlowCalendar buckets={buckets} assetsById={assetsById} />
              <p className="mt-4 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
                {taxed ? 'Суммы после НДФЛ' : 'Суммы до НДФЛ (ставка 0%)'} для текущего количества бумаг. Подпись у выплаты говорит, откуда сумма: рекомендовано советом директоров, прогноз, как год назад, средняя выплата, как последняя выплата или ваша сумма.{' '}
                <TransitionLink to={guidePath('calendar')} className="font-semibold text-[var(--hi-gold)]">
                  Как читать календарь
                </TransitionLink>
              </p>
            </div>
          ) : (
            <div key="history" className="space-y-3 animate-[hi-fade-slide-up_0.4s_var(--hi-ease-out)_both]">
              <Hint id="payments-history" more="sources">
                Суммы — до налога, на одну бумагу (у аренды и вклада — целиком). <SyncGlyph /> загружает выплаты бумаги из
                открытых источников, «+» добавляет выплату вручную — для аренды, вкладов и бумаг, которых нет в источниках.
              </Hint>
              {Array.from(typeGroups.entries()).map(([type, groupAssets]) => (
                <TypeSection
                  key={type}
                  type={type}
                  assets={groupAssets}
                  paymentsByAsset={paymentsByAsset}
                  highlightAssetId={highlightAssetId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
