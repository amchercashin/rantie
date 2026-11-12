import type { CategoryStats } from '@/models/types';
import { getTypeColor } from '@/models/account';
import { Card, CategoryDot } from '@/components/ds/surface';
import { TransitionLink } from '@/components/ui/transition-link';
import { ChevronRight } from 'lucide-react';
import { formatIncome, formatPercent, plural } from '@/lib/utils';

interface IncomeStructureProps {
  categories: CategoryStats[];
  mode: 'month' | 'year';
  animate?: boolean;
}

/** Share of income by asset class: a stacked bar and a tappable list. */
export function IncomeStructure({ categories, mode, animate = true }: IncomeStructureProps) {
  const totalIncome = categories.reduce((sum, c) => sum + c.totalIncomePerMonth, 0);
  const withIncome = categories.filter((c) => c.totalIncomePerMonth > 0);

  return (
    <Card className="overflow-hidden">
      {totalIncome > 0 && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full" aria-hidden="true">
            {withIncome.map((c, i) => (
              <div
                key={c.type}
                className="h-full rounded-full origin-left"
                style={{
                  width: `${(c.totalIncomePerMonth / totalIncome) * 100}%`,
                  backgroundColor: getTypeColor(c.type),
                  animation: animate ? `hi-bar-grow-x 0.9s var(--hi-ease-out) ${0.4 + i * 0.08}s both` : undefined,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {categories.map((c) => {
          const color = getTypeColor(c.type);
          const incomeShare = totalIncome > 0 ? (c.totalIncomePerMonth / totalIncome) * 100 : 0;
          const income = mode === 'month' ? c.totalIncomePerMonth : c.totalIncomePerYear;
          return (
            <TransitionLink
              key={c.type}
              to={`/category/${encodeURIComponent(c.type)}`}
              className="hi-pressable relative flex items-center gap-3 px-4 py-3.5 active:bg-[var(--hi-raised)] after:absolute after:bottom-0 after:left-10 after:right-0 after:h-px after:bg-[var(--hi-line)] last:after:hidden"
            >
              <CategoryDot color={color} className="ml-1 mr-1" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[length:var(--hi-text-heading)] font-medium text-[var(--hi-text)]">{c.type}</div>
                <div className="mt-0.5 truncate text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">
                  {Math.round(incomeShare)}% дохода · {c.assetCount} {plural(c.assetCount, ['позиция', 'позиции', 'позиций'])}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[length:var(--hi-text-body)] font-semibold text-[var(--hi-gold)]">{formatIncome(income)}</div>
                <div className="mt-0.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">{c.yieldPercent != null ? `${formatPercent(c.yieldPercent)} годовых` : 'нет цены'}</div>
              </div>
              <ChevronRight className="size-4 shrink-0 text-[var(--hi-text-3)]" />
            </TransitionLink>
          );
        })}
      </div>
    </Card>
  );
}
