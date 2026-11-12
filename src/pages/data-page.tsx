import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { FileUp, Landmark, Plus } from 'lucide-react';
import { useAccounts } from '@/hooks/use-accounts';
import { useHoldings } from '@/hooks/use-holdings';
import { useAssets } from '@/hooks/use-assets';
import { useDemoAccountId } from '@/hooks/use-demo';
import { useExchangeRateMap } from '@/hooks/use-exchange-rates';
import { getRateToRub } from '@/services/exchange-rates';
import { AppShell } from '@/components/layout/app-shell';
import { AccountSection } from '@/components/data/account-section';
import { AddAccountSheet } from '@/components/data/add-account-sheet';
import { EmptyState } from '@/components/ds/surface';
import { Button, IconButton } from '@/components/ds/button';
import { Hint } from '@/components/ds/hint';
import { formatCurrency, plural } from '@/lib/utils';

const ImportFlow = lazy(() => import('@/components/data/import-flow').then((m) => ({ default: m.ImportFlow })));

interface DataPageState {
  highlightAccountId?: number;
  highlightAssetId?: number;
  action?: 'import' | 'add-account';
}

export function DataPage() {
  const accounts = useAccounts();
  const holdings = useHoldings();
  const assets = useAssets();
  const demoAccountId = useDemoAccountId();
  const rates = useExchangeRateMap();
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [focusAccountId, setFocusAccountId] = useState<number | null>(null);
  const [importTarget, setImportTarget] = useState<{ accountId: number | null; accountName?: string } | null>(null);

  const location = useLocation();
  const [navState] = useState(() => location.state as DataPageState | null);

  // Consume one-shot navigation state (highlight / action) so back navigation doesn't replay it.
  useEffect(() => {
    if (!navState) return;
    if (navState.action === 'import') setImportTarget({ accountId: null });
    if (navState.action === 'add-account') setAddAccountOpen(true);
    window.history.replaceState({ ...window.history.state, usr: undefined }, '');
  }, [navState]);

  const totalValue = useMemo(() => {
    const byId = new Map(assets.map((a) => [a.id!, a]));
    return holdings.reduce((sum, h) => {
      const a = byId.get(h.assetId);
      const price = a?.currentPrice ?? h.averagePrice ?? 0;
      return sum + price * h.quantity * getRateToRub(a?.currency, rates);
    }, 0);
  }, [assets, holdings, rates]);

  const isEmpty = accounts.length === 0;

  return (
    <AppShell
      title="Счета"
      subtitle={
        !isEmpty &&
        `${accounts.length} ${plural(accounts.length, ['счёт', 'счёта', 'счетов'])} · капитал ${formatCurrency(totalValue)}`
      }
      actions={
        !isEmpty && (
          <IconButton label="Добавить счёт" tone="gold" onClick={() => setAddAccountOpen(true)}>
            <Plus />
          </IconButton>
        )
      }
    >
      {isEmpty ? (
        <EmptyState
          icon={<Landmark />}
          title="Пока нет счетов"
          description="Загрузите отчёт брокера — бумаги, количество и цены подтянутся сами. Или добавьте вклады и недвижимость вручную."
        >
          <Button variant="primary" size="lg" block icon={<FileUp />} onClick={() => setImportTarget({ accountId: null })}>
            Импорт отчёта брокера
          </Button>
          <Button variant="secondary" size="lg" block icon={<Plus />} onClick={() => setAddAccountOpen(true)}>
            Добавить счёт
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          <Hint id="data-accounts" more="import">
            Нажмите на позицию, чтобы изменить количество, цену или категорию. Свежий отчёт, импортированный в счёт, обновит
            количество и уберёт проданные бумаги.
          </Hint>
          {accounts.map((account, i) => (
            <div key={account.id} style={{ animation: `hi-fade-slide-up 0.5s var(--hi-ease-out) ${0.05 * i}s both` }}>
              <AccountSection
                account={account}
                holdings={holdings.filter((h) => h.accountId === account.id)}
                assets={assets}
                isDemo={account.id === demoAccountId}
                onImport={() => setImportTarget({ accountId: account.id!, accountName: account.name })}
                highlightAssetId={navState?.highlightAccountId === account.id ? navState?.highlightAssetId : undefined}
                focus={focusAccountId === account.id}
              />
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAddAccountOpen(true)}
            className="hi-pressable flex h-14 w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-[var(--hi-line-strong)] text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text-2)] active:bg-[var(--hi-surface)]"
          >
            <Plus className="size-4" /> Добавить счёт
          </button>
        </div>
      )}

      <AddAccountSheet
        open={addAccountOpen}
        onClose={() => setAddAccountOpen(false)}
        onImport={() => setImportTarget({ accountId: null })}
        onCreated={setFocusAccountId}
      />

      {importTarget !== null && (
        <Suspense fallback={null}>
          <ImportFlow
            open
            onClose={() => setImportTarget(null)}
            accountId={importTarget.accountId}
            accountName={importTarget.accountName}
          />
        </Suspense>
      )}
    </AppShell>
  );
}
