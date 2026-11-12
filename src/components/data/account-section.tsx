import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, FileUp, MoreHorizontal, PencilLine, Plus, Trash2, Wallet } from 'lucide-react';
import type { Account, Holding } from '@/models/account';
import type { Asset } from '@/models/types';
import { getTypeColor } from '@/models/account';
import { cn, formatCurrency, formatMoney, formatNumber, plural } from '@/lib/utils';
import { updateAccount, deleteAccount } from '@/hooks/use-accounts';
import { useExchangeRateMap } from '@/hooks/use-exchange-rates';
import { getRateToRub } from '@/services/exchange-rates';
import { Card, AssetAvatar, CategoryDot } from '@/components/ds/surface';
import { Badge } from '@/components/ds/badge';
import { BottomSheet } from '@/components/ds/bottom-sheet';
import { useFeedback } from '@/components/ds/feedback';
import { EditTextSheet } from './edit-text-sheet';
import { HoldingSheet } from './holding-sheet';
import { AddAssetSheet } from './add-asset-sheet';

interface AccountSectionProps {
  account: Account;
  holdings: Holding[];
  assets: Asset[];
  onImport: () => void;
  highlightAssetId?: number;
  isDemo?: boolean;
  /** Open and scroll into view (e.g. right after the account was created). */
  focus?: boolean;
}

export function AccountSection({ account, holdings, assets, onImport, highlightAssetId, isDemo, focus }: AccountSectionProps) {
  const [expanded, setExpanded] = useState(highlightAssetId != null || !!focus);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focus) return;
    setExpanded(true);
    const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [focus]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [editing, setEditing] = useState<{ asset: Asset; holding: Holding } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const highlightRowRef = useRef<HTMLButtonElement>(null);
  const exchangeRates = useExchangeRateMap();
  const { confirm, toast } = useFeedback();

  useEffect(() => {
    if (highlightAssetId == null) return;
    setExpanded(true);
    const t = setTimeout(() => highlightRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
    return () => clearTimeout(t);
  }, [highlightAssetId]);

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id!, a])), [assets]);
  const allTypes = useMemo(() => [...new Set(assets.map((a) => a.type))], [assets]);

  const rows = useMemo(() => {
    return holdings
      .map((holding) => {
        const asset = assetById.get(holding.assetId);
        if (!asset) return null;
        const price = asset.currentPrice ?? holding.averagePrice ?? 0;
        const valueOwn = price * holding.quantity;
        const valueRub = valueOwn * getRateToRub(asset.currency, exchangeRates);
        return { asset, holding, valueOwn, valueRub };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
  }, [holdings, assetById, exchangeRates]);

  const totalValue = rows.reduce((sum, r) => sum + r.valueRub, 0);
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = map.get(r.asset.type) ?? [];
      arr.push(r);
      map.set(r.asset.type, arr);
    }
    return [...map.entries()]
      .map(([type, items]) => ({ type, items: items.sort((a, b) => b.valueRub - a.valueRub), value: items.reduce((s, r) => s + r.valueRub, 0) }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);
  const fromImport = holdings.length > 0 && holdings.every((h) => h.quantitySource === 'import');

  const removeAccount = async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: `Удалить счёт «${account.name}»?`,
      description: 'Все позиции счёта будут удалены. Бумаги, которых нет в других счетах, исчезнут вместе с историей выплат.',
      confirmLabel: 'Удалить счёт',
      destructive: true,
    });
    if (!ok || account.id == null) return;
    await deleteAccount(account.id);
    toast('Счёт удалён');
  };

  return (
    <Card ref={cardRef} className="overflow-hidden" data-account-id={account.id}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="hi-pressable flex min-w-0 flex-1 items-center gap-3 py-4 pl-4 pr-2 text-left active:bg-[var(--hi-raised)]"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--hi-line-strong)] bg-[var(--hi-raised)] text-[var(--hi-gold)]">
            <Wallet className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-[length:var(--hi-text-heading)] font-semibold text-[var(--hi-text)]">{account.name}</span>
              {isDemo ? <Badge tone="info">демо</Badge> : fromImport && <Badge tone="neutral">импорт</Badge>}
            </div>
            <div className="mt-0.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
              {holdings.length} {plural(holdings.length, ['позиция', 'позиции', 'позиций'])} · {formatCurrency(totalValue)}
            </div>
          </div>
          <ChevronDown className={cn('size-4 shrink-0 text-[var(--hi-text-3)] transition-transform duration-300', expanded && 'rotate-180')} />
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label={`Действия со счётом ${account.name}`}
          className="hi-pressable mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--hi-text-2)] active:bg-[var(--hi-raised)]"
        >
          <MoreHorizontal className="size-5" />
        </button>
      </div>

      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-[var(--hi-ease-out)]', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--hi-line)]">
            {groups.length === 0 && (
              <div className="px-4 py-5 text-center text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                В счёте пока нет активов
              </div>
            )}
            {groups.map((group) => (
              <div key={group.type}>
                <div className="flex items-center justify-between bg-[color-mix(in_srgb,var(--hi-void)_45%,transparent)] px-4 pb-2 pt-3">
                  <span className="inline-flex items-center gap-2 hi-eyebrow">
                    <CategoryDot color={getTypeColor(group.type)} className="size-2" />
                    {group.type}
                  </span>
                  <span className="text-[length:var(--hi-text-micro)] font-semibold text-[var(--hi-text-3)]">{formatCurrency(group.value)}</span>
                </div>
                {group.items.map(({ asset, holding, valueOwn }) => {
                  const highlighted = highlightAssetId === asset.id;
                  const cost = holding.averagePrice != null ? holding.averagePrice * holding.quantity : null;
                  return (
                    <button
                      key={holding.id}
                      ref={highlighted ? highlightRowRef : undefined}
                      type="button"
                      onClick={() => { setEditing({ asset, holding }); setEditOpen(true); }}
                      className={cn(
                        'hi-pressable relative flex w-full items-center gap-3 px-4 py-3 text-left active:bg-[var(--hi-raised)]',
                        'after:absolute after:bottom-0 after:left-[68px] after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden',
                        highlighted && 'animate-highlight-pulse',
                      )}
                    >
                      <AssetAvatar label={asset.ticker ?? asset.name} color={getTypeColor(asset.type)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[length:var(--hi-text-body)] font-medium text-[var(--hi-text)]">{asset.name}</div>
                        <div className="mt-0.5 truncate text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                          {asset.ticker && <span className="font-semibold">{asset.ticker} · </span>}
                          {formatNumber(holding.quantity)} шт
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-text)]">{formatMoney(valueOwn, asset.currency)}</div>
                        {cost != null && cost > 0 && (
                          <div className="mt-0.5 whitespace-nowrap text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
                            куплено за {asset.currency && asset.currency !== 'RUB' ? formatMoney(cost, asset.currency) : formatCurrency(cost)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}

            <div className="grid grid-cols-2 gap-2 border-t border-[var(--hi-line)] p-3">
              <button
                type="button"
                onClick={() => setAddAssetOpen(true)}
                className="hi-pressable inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--hi-line-strong)] text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-2)] active:bg-[var(--hi-raised)]"
              >
                <Plus className="size-4" /> Добавить актив
              </button>
              <button
                type="button"
                onClick={onImport}
                className="hi-pressable inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--hi-line-strong)] text-[length:var(--hi-text-caption)] font-semibold text-[var(--hi-text-2)] active:bg-[var(--hi-raised)]"
              >
                <FileUp className="size-4" /> Импорт отчёта
              </button>
            </div>
          </div>
        </div>
      </div>

      <BottomSheet open={menuOpen} onOpenChange={setMenuOpen} title={account.name} description="Действия со счётом" hideDescription>
        <Card className="overflow-hidden">
          {[
            { icon: <PencilLine />, label: 'Переименовать', onClick: () => { setMenuOpen(false); setRenameOpen(true); } },
            { icon: <Plus />, label: 'Добавить актив', onClick: () => { setMenuOpen(false); setAddAssetOpen(true); } },
            { icon: <FileUp />, label: 'Импорт отчёта брокера', onClick: () => { setMenuOpen(false); onImport(); } },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="hi-pressable relative flex w-full items-center gap-3 px-4 py-4 text-left text-[length:var(--hi-text-body)] text-[var(--hi-text)] active:bg-[var(--hi-raised)] after:absolute after:bottom-0 after:left-12 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden [&_svg]:size-[18px] [&_svg]:text-[var(--hi-gold)]"
            >
              {item.icon} {item.label}
            </button>
          ))}
        </Card>
        <button
          type="button"
          onClick={removeAccount}
          className="hi-pressable mt-3 flex w-full items-center gap-3 rounded-[22px] border border-[rgba(224,122,107,0.2)] bg-[var(--hi-negative-tint)] px-4 py-4 text-left text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-negative)]"
        >
          <Trash2 className="size-[18px]" /> Удалить счёт
        </button>
      </BottomSheet>

      <EditTextSheet
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Название счёта"
        label="Название"
        initialValue={account.name}
        onSave={async (name) => { if (account.id != null) await updateAccount(account.id, { name }); }}
      />

      {editing && (
        <HoldingSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          asset={editing.asset}
          holding={editing.holding}
          existingTypes={allTypes}
        />
      )}

      <AddAssetSheet open={addAssetOpen} onClose={() => setAddAssetOpen(false)} accountId={account.id!} existingTypes={allTypes} />
    </Card>
  );
}
