import { ChevronRight } from 'lucide-react';
import { TransitionLink } from '@/components/ui/transition-link';
import { AssetAvatar } from '@/components/ds/surface';
import { SourceBadge } from '@/components/ds/badge';
import type { Asset } from '@/models/types';
import { getTypeColor } from '@/models/account';
import { formatCurrency, formatIncome, formatNumber, formatPercent } from '@/lib/utils';
import type { CalculatedAssetStats } from '@/services/portfolio-calculator';

interface AssetRowProps {
  asset: Asset;
  stats: CalculatedAssetStats;
}

export function AssetRow({ asset, stats }: AssetRowProps) {
  const isManual = asset.paymentPerUnitSource === 'manual';
  const color = getTypeColor(asset.type);
  const priced = stats.value > 0;
  // Income without a price is still income: say the price is missing, not that nothing is paid.
  const yieldLabel = stats.rateMissing
    ? 'нет курса'
    : !(stats.incomePerMonth > 0)
      ? 'нет выплат'
      : priced
        ? formatPercent(stats.yieldPercent)
        : 'нет цены';

  return (
    <TransitionLink
      to={`/asset/${asset.id}`}
      className="hi-pressable relative flex items-center gap-3 px-4 py-3.5 active:bg-[var(--hi-raised)] after:absolute after:bottom-0 after:left-[68px] after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden"
    >
      <AssetAvatar label={asset.ticker ?? asset.name} color={color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[length:var(--hi-text-body)] font-semibold leading-tight text-[var(--hi-text)]">{asset.name}</span>
          {isManual && <SourceBadge source="manual" />}
        </div>
        <div className="mt-1 truncate text-[length:var(--hi-text-caption)] leading-tight text-[var(--hi-text-3)]">
          {asset.ticker && <span className="font-semibold tracking-wide">{asset.ticker} · </span>}
          {formatNumber(stats.totalQuantity)} шт{priced && ` · ${formatCurrency(stats.value)}`}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-gold)]">
          {formatIncome(stats.incomePerMonth)}
        </div>
        <div className="mt-1 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
          {yieldLabel}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[var(--hi-text-3)]" />
    </TransitionLink>
  );
}
