import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CalendarClock, ChevronRight, History, PencilLine, Plus } from 'lucide-react';
import { withViewTransition } from '@/lib/view-transition';
import { AppShell } from '@/components/layout/app-shell';
import { SummaryCard } from '@/components/shared/summary-card';
import { PaymentHistoryChart } from '@/components/shared/payment-history-chart';
import { IncomeAmountSheet } from '@/components/asset-detail/income-amount-sheet';
import { Segmented } from '@/components/ds/segmented';
import { Card, ListRow, Section, EmptyState } from '@/components/ds/surface';
import { SourceBadge } from '@/components/ds/badge';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { Button } from '@/components/ds/button';
import { Hint } from '@/components/ds/hint';
import { InfoLink } from '@/components/ds/info-link';
import { SyncGlyph } from '@/components/ds/sync-glyph';
import { MissingRateNotice } from '@/components/shared/missing-rate-notice';
import { useAsset, updateAsset } from '@/hooks/use-assets';
import { usePortfolioStats } from '@/hooks/use-portfolio-stats';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { usePaymentHistory } from '@/hooks/use-payment-history';
import { useHoldingsByAsset } from '@/hooks/use-holdings';
import { useAccounts } from '@/hooks/use-accounts';
import { calcAssetAnnualIncomePerUnit } from '@/services/income-calculator';
import { normalizeCurrency } from '@/services/exchange-rates';
import { incomeSpreadOf, isExchangeTraded } from '@/models/asset-kind';
import {
  cn, formatCurrency, formatCurrencyFull, formatFrequency, formatLongDate, formatMoney, formatNumber, formatNumericDate, formatPrice, plural,
} from '@/lib/utils';

const FREQUENCIES = [12, 4, 2, 1];

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const assetId = Number(id);
  const asset = useAsset(assetId);
  const { assetsById, projection } = usePortfolioStats();
  const history = usePaymentHistory(assetId);
  const holdings = useHoldingsByAsset(assetId);
  const accounts = useAccounts();
  const ndflRates = useNdflRates();
  const [editIncome, setEditIncome] = useState(false);
  const [editFrequency, setEditFrequency] = useState(false);

  const computed = useMemo(() => {
    if (!asset) return null;
    const records = history.filter((h) => !h.isForecast).map((h) => ({ amount: h.amount, date: new Date(h.date) }));
    const spread = incomeSpreadOf(asset);
    const calculated = calcAssetAnnualIncomePerUnit({ ...asset, paymentPerUnitSource: 'fact' }, spread, records, new Date());
    const annualIncome = asset.paymentPerUnitSource === 'manual' && asset.paymentPerUnit != null ? asset.paymentPerUnit : calculated.annualIncome;
    const totalQuantity = holdings.reduce((sum, h) => sum + h.quantity, 0);
    const costBasis = holdings.reduce((sum, h) => sum + (h.averagePrice ?? 0) * h.quantity, 0);
    const next = projection.find((p) => p.assetId === assetId);
    return {
      spread,
      calculated,
      annualIncome,
      totalQuantity,
      costBasis,
      next,
      stats: assetsById.get(assetId),
      chartHistory: history
        .filter((h) => !(h.isForecast && h.amount <= 0))
        .map((h) => ({ amount: h.amount, date: new Date(h.date), isForecast: h.isForecast })),
    };
  }, [asset, history, holdings, assetsById, projection, assetId]);

  if (!asset || !computed) {
    return (
      <AppShell back="/">
        {asset === undefined ? <div className="hi-skeleton mt-4 h-48 rounded-[22px]" /> : <EmptyState title="Актив не найден" />}
      </AppShell>
    );
  }

  const { spread, calculated, annualIncome, totalQuantity, costBasis, next, stats } = computed;
  const isManual = asset.paymentPerUnitSource === 'manual';
  const currency = asset.currency ?? 'RUB';
  const exchange = isExchangeTraded(asset);
  const price = asset.currentPrice;
  const identifiers = [asset.ticker, asset.isin && asset.isin !== asset.ticker ? asset.isin : null, asset.type].filter(Boolean).join(' · ');

  const openData = () =>
    withViewTransition(() => navigate('/data', {
      state: holdings.length > 0 ? { highlightAccountId: holdings[0].accountId, highlightAssetId: assetId } : undefined,
    }));
  const openPayments = () => withViewTransition(() => navigate('/payments', { state: { highlightAssetId: assetId } }));

  const hasPayments = calculated.usedPayments.length > 0;
  const incomeExplanation = !hasPayments
    ? exchange
      ? asset.type === 'Облигации'
        ? 'За последние 12 месяцев выплат не было. Нажмите «Обновить» на главной, чтобы загрузить их с биржи.'
        : 'За последние 12 месяцев выплат не было — или их нет в открытых источниках. Если бумага платит, добавьте выплаты на вкладке «Выплаты».'
      : spread === 'period'
        ? 'Выплат пока нет — запишите первую, и доход появится сразу.'
        : 'За последние 12 месяцев выплат не было.'
    : spread === 'period'
      ? `Последняя выплата × ${asset.frequencyPerYear} (${formatFrequency(asset.frequencyPerYear)})`
      : calculated.annualized
        ? `Бумага платит меньше года — средняя из ${calculated.annualized.payouts} ${plural(calculated.annualized.payouts, ['выплаты', 'выплат', 'выплат'])} × ${calculated.annualized.frequencyPerYear} (${formatFrequency(calculated.annualized.frequencyPerYear)})`
        : `Сумма ${calculated.usedPayments.length} ${calculated.usedPayments.length === 1 ? 'выплаты' : 'выплат'} за 12 месяцев`;
  // "на 1 бумагу" for securities, "на 1 шт" for several units, nothing for a single object.
  const perUnitLabel = exchange ? 'на 1 бумагу' : totalQuantity === 1 ? '' : 'на 1 шт';
  const taxed = (ndflRates.get(asset.type) ?? 0) > 0;
  // Without a rate the ruble figures are unknown — show dashes, not a misleading 0 ₽.
  const rateMissing = stats?.rateMissing ?? false;
  // Without a price the value is unknown too, and so are the yield and the share; the income is not.
  const valueKnown = !rateMissing && (stats?.value ?? 0) > 0;

  return (
    <AppShell back={`/category/${encodeURIComponent(asset.type)}`} title={asset.name} subtitle={identifiers}>
      <SummaryCard
        incomePerMonth={rateMissing ? null : stats?.incomePerMonth ?? 0}
        totalValue={valueKnown ? stats?.value ?? null : null}
        yieldPercent={valueKnown ? stats?.yieldPercent ?? null : null}
        portfolioSharePercent={valueKnown ? stats?.portfolioSharePercent ?? null : null}
        badges={<SourceBadge source={isManual ? 'manual' : 'fact'} />}
        taxed={taxed}
      />

      {rateMissing && (
        <MissingRateNotice
          currencies={[normalizeCurrency(currency)]}
          description="Без него доход и стоимость не пересчитать в рубли, и актив не попадает в итог портфеля."
          className="mt-4"
        />
      )}

      <Section title="Как считать доход" className="mt-8" action={<InfoLink section="income-modes" className="-my-2 -mr-1 flex" />}>
        <Card className="overflow-hidden">
          <div className="px-4 pt-4">
            <Segmented
              value={isManual ? 'manual' : 'fact'}
              onChange={(mode) => {
                if (mode === 'manual') setEditIncome(true);
                else updateAsset(assetId, { paymentPerUnitSource: 'fact', paymentPerUnit: undefined });
              }}
              ariaLabel="Способ расчёта дохода"
              className="w-full"
              options={[
                { value: 'fact', label: 'По выплатам' },
                { value: 'manual', label: 'Своя сумма' },
              ]}
            />
          </div>

          {isManual ? (
            <button
              type="button"
              onClick={() => setEditIncome(true)}
              className="hi-pressable flex w-full items-start gap-3 px-4 py-4 text-left active:bg-[var(--hi-raised)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[22px] font-semibold text-[var(--hi-text)]">{formatPrice(annualIncome / 12, currency)}</span>
                  <span className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                    в месяц · {formatPrice(annualIncome, currency)} в год, до НДФЛ
                  </span>
                </div>
                <div className="mt-1 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]">
                  Учитывается каждый месяц, пока вы её не измените. Записи выплат на доход не влияют.
                </div>
              </div>
              <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-gold)]">
                <PencilLine className="size-3.5" /> Изменить
              </span>
            </button>
          ) : (
            <div className="px-4 py-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[22px] font-semibold text-[var(--hi-text)]">
                  {annualIncome > 0 ? formatPrice(annualIncome, currency) : '—'}
                </span>
                <span className="text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">в год{perUnitLabel && ` ${perUnitLabel}`}, до НДФЛ</span>
              </div>
              <div className="mt-1 text-[length:var(--hi-text-caption)] leading-snug text-[var(--hi-text-3)]">{incomeExplanation}</div>
              {calculated.usedPayments.length > 0 && (
                <div className="mt-3 border-t border-[var(--hi-line)] pt-2">
                  {calculated.usedPayments.map((p, i) => (
                    <div key={i} className="flex justify-between py-0.5 text-[length:var(--hi-text-caption)]">
                      <span className="text-[var(--hi-text-3)]">{formatNumericDate(p.date)}</span>
                      <span className="text-[var(--hi-text-2)]">{formatPrice(p.amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {!exchange && (
                <Button variant="outline" size="sm" className="mt-3" icon={<Plus />} onClick={openPayments}>
                  Записать выплату
                </Button>
              )}
            </div>
          )}

          {!exchange && (
            <ListRow
              title="Периодичность выплат"
              subtitle={isManual ? 'Для календаря выплат' : 'Выплата покрывает свой период'}
              trailing={
                <span className="text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-2)]">
                  {formatFrequency(asset.frequencyPerYear)}
                </span>
              }
              chevron
              onClick={() => setEditFrequency(true)}
              className="border-t border-[var(--hi-line)]"
            />
          )}
        </Card>
      </Section>

      <Hint id="asset-income-modes" className="mt-4" title="Два способа учесть доход" more="income-modes">
        {exchange ? (
          <>
            «По выплатам» — сумма выплат бумаги за последние 12 месяцев из открытых источников, обновляется кнопкой <SyncGlyph /> на
            «Доходе». «Своя сумма» — если знаете точнее: например, объявлен новый дивиденд или бумаги нет в источниках.
          </>
        ) : (
          '«Своя сумма» — укажите, сколько приходит в месяц, и забудьте. «По выплатам» — записывайте каждое поступление во вкладке «Выплаты»: доход будет точным, но пропадёт, если забыть внести очередную выплату.'
        )}
      </Hint>

      {next && (
        <Section title="Следующая выплата" className="mt-8">
          <Card glow className="flex items-center gap-4 px-4 py-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-[rgba(217,192,142,0.3)] bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]">
              <CalendarClock className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{formatLongDate(next.date)}</div>
              <div className="mt-0.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                {perUnitLabel ? `${formatPrice(next.perUnit, currency)} ${perUnitLabel} · ` : ''}{next.basis === 'forecast' ? 'прогноз' : next.estimated ? 'дата условная' : 'ожидается'}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-positive)]">+{formatCurrencyFull(next.amount)}</div>
              <div className="mt-0.5 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">{taxed ? 'после НДФЛ' : 'до НДФЛ'}</div>
            </div>
          </Card>
        </Section>
      )}

      <Section title="Позиция" className="mt-8">
        <Card className="overflow-hidden">
          <ListRow
            title="Количество"
            subtitle={holdings.length > 1 ? holdings.map((h) => `${accounts.find((a) => a.id === h.accountId)?.name ?? 'Счёт'}: ${formatNumber(h.quantity)}`).join(' · ') : undefined}
            trailing={<span className="font-semibold text-[var(--hi-text)]">{formatNumber(totalQuantity)} шт</span>}
            chevron
            onClick={openData}
          />
          <ListRow
            title="Текущая цена"
            subtitle={asset.moexSecid && price != null ? 'Мосбиржа' : undefined}
            trailing={<span className="font-semibold text-[var(--hi-text)]">{formatPrice(price, currency)}</span>}
          />
          <ListRow
            title="Стоимость"
            trailing={<span className="font-semibold text-[var(--hi-text)]">{formatCurrency(rateMissing ? null : stats?.value ?? null)}</span>}
          />
          {costBasis > 0 && (
            <ListRow
              title="Куплено за"
              subtitle={stats && stats.value > 0 ? `Доход на вложенное: ${((annualIncome * totalQuantity) / costBasis * 100).toFixed(1).replace('.', ',')}% годовых` : undefined}
              trailing={<span className="font-semibold text-[var(--hi-text)]">{formatMoney(costBasis, currency)}</span>}
            />
          )}
        </Card>
      </Section>

      <Section title="История" className="mt-8">
        <PaymentHistoryChart history={computed.chartHistory} currency={currency} unitLabel={perUnitLabel} />
        <Button variant="secondary" block className="mt-3" icon={<History />} onClick={openPayments}>
          Все выплаты <ChevronRight className="ml-auto text-[var(--hi-text-3)]" />
        </Button>
      </Section>

      <IncomeAmountSheet
        open={editIncome}
        onOpenChange={setEditIncome}
        annualIncome={annualIncome || null}
        calculatedAnnual={calculated.annualIncome}
        currency={currency}
        defaultUnit={exchange ? 'year' : 'month'}
        onSave={(v) => updateAsset(assetId, { paymentPerUnit: v, paymentPerUnitSource: 'manual' })}
      />

      <BottomSheet
        open={editFrequency}
        onOpenChange={setEditFrequency}
        title="Периодичность"
        description="Как часто приходят выплаты. Каждая выплата учитывается в доходе на свой период — например, месячная аренда сразу даёт полный месячный доход."
      >
        <Card className="overflow-hidden">
          {FREQUENCIES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={async () => {
                await updateAsset(assetId, { frequencyPerYear: f, frequencySource: 'manual' });
                setEditFrequency(false);
              }}
              className={cn(
                'hi-pressable relative flex w-full items-center justify-between px-4 py-4 text-left text-[length:var(--hi-text-body)] active:bg-[var(--hi-raised)]',
                'after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden',
                asset.frequencyPerYear === f ? 'text-[var(--hi-gold)] font-semibold' : 'text-[var(--hi-text)]',
              )}
            >
              <span className="first-letter:uppercase">{formatFrequency(f)}</span>
              {asset.frequencyPerYear === f && <span className="size-2 rounded-full bg-[var(--hi-gold)]" />}
            </button>
          ))}
        </Card>
      </BottomSheet>
    </AppShell>
  );
}
