import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { SummaryCard } from '@/components/shared/summary-card';
import { AssetRow } from '@/components/category/asset-row';
import { Card, CategoryDot, Section, EmptyState } from '@/components/ds/surface';
import { usePortfolioStats } from '@/hooks/use-portfolio-stats';
import { getTypeColor } from '@/models/account';
import { formatPercent, plural } from '@/lib/utils';

export function CategoryPage() {
  const { type } = useParams<{ type: string }>();
  const decodedType = decodeURIComponent(type ?? '');
  const { categories, assetsById, assets, isLoading } = usePortfolioStats();
  const catStats = categories.find((c) => c.type === decodedType);
  const taxed = catStats?.taxed ?? false;
  const rows = useMemo(
    () =>
      assets
        .filter((a) => a.type === decodedType && a.id != null)
        .map((asset) => ({ asset, stats: assetsById.get(asset.id!)! }))
        .filter((r) => r.stats)
        .sort((a, b) => b.stats.incomePerMonth - a.stats.incomePerMonth || b.stats.value - a.stats.value),
    [assets, assetsById, decodedType],
  );

  return (
    <AppShell
      back="/"
      title={
        <span className="inline-flex items-center gap-3">
          <CategoryDot color={getTypeColor(decodedType)} className="size-3" />
          {decodedType}
        </span>
      }
      compactTitle={decodedType}
      subtitle={
        catStats &&
        `${catStats.assetCount} ${plural(catStats.assetCount, ['позиция', 'позиции', 'позиций'])} · ${catStats.yieldPercent != null ? `${formatPercent(catStats.yieldPercent)} годовых` : 'нет цены'}`
      }
    >
      {catStats && (
        <SummaryCard
          incomePerMonth={catStats.totalIncomePerMonth}
          totalValue={catStats.totalValue > 0 ? catStats.totalValue : null}
          yieldPercent={catStats.yieldPercent}
          portfolioSharePercent={catStats.totalValue > 0 ? catStats.portfolioSharePercent : null}
          taxed={taxed}
        />
      )}

      <Section title="Активы" className="mt-8" action={<span className="hi-eyebrow normal-case tracking-normal">доход в мес · годовых</span>}>
        {rows.length > 0 ? (
          <Card className="overflow-hidden">
            {rows.map(({ asset, stats }) => (
              <AssetRow key={asset.id} asset={asset} stats={stats} />
            ))}
          </Card>
        ) : (
          !isLoading && <EmptyState title="Здесь пусто" description="В этой категории больше нет активов." />
        )}
      </Section>
    </AppShell>
  );
}
