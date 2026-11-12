import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useAccountNdflRates, useNdflRates } from '@/hooks/use-ndfl-rates';
import { DEFAULT_NDFL_RATE, updateAccountNdflRate, updateNdflRate } from '@/services/app-settings';
import { getTypeColor, type Account, type Holding } from '@/models/account';
import type { Asset } from '@/models/types';
import { Card, Section } from '@/components/ds/surface';
import { NdflAccountRateRow, NdflRateSelector } from './ndfl-rate-selector';

export interface NdflCategoryAccounts {
  category: string;
  /** Accounts holding something of this category, in the order of the Счета tab. */
  accounts: { id: number; name: string }[];
}

/** Every category held, with the accounts that hold it — follows the portfolio as it changes. */
export function ndflCategoryAccounts(assets: Asset[], holdings: Holding[], accounts: Account[]): NdflCategoryAccounts[] {
  const typeByAsset = new Map(assets.filter((a) => a.id != null).map((a) => [a.id!, a.type]));
  const accountIdsByType = new Map<string, Set<number>>();
  for (const h of holdings) {
    const type = typeByAsset.get(h.assetId);
    if (type == null) continue;
    const ids = accountIdsByType.get(type) ?? new Set<number>();
    ids.add(h.accountId);
    accountIdsByType.set(type, ids);
  }
  const types = [...new Set(assets.map((a) => a.type))].sort();
  return types.map((category) => {
    const ids = accountIdsByType.get(category) ?? new Set<number>();
    return {
      category,
      accounts: accounts.filter((a) => a.id != null && ids.has(a.id)).map((a) => ({ id: a.id!, name: a.name })),
    };
  });
}

export function NdflSettings() {
  const tree = useLiveQuery(async () => {
    const [assets, holdings, accounts] = await Promise.all([db.assets.toArray(), db.holdings.toArray(), db.accounts.toArray()]);
    return ndflCategoryAccounts(assets, holdings, accounts);
  }, []);

  const ndflRates = useNdflRates();
  const accountRates = useAccountNdflRates();

  if (!tree || tree.length === 0) return null;

  return (
    <Section
      title="НДФЛ с дохода"
      description="Выплаты хранятся до налога. Доход и доходность считаются после применения ставки."
    >
      <p className="mb-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
        По умолчанию 13% — так облагаются дивиденды, купоны и проценты по вкладам у большинства. 15% — если
        инвестиционный доход больше 2,4 млн ₽ в год, 4% — аренда как самозанятый, 0% — ИИС с налоговой льготой.
        Счёт внутри категории можно обложить по-своему — например, акции на ИИС по 0%.
      </p>
      <Card className="overflow-hidden px-4">
        {tree.map(({ category, accounts }, i) => {
          const categoryRate = ndflRates.get(category) ?? DEFAULT_NDFL_RATE;
          return (
            <div key={category} className={i > 0 ? 'border-t border-[var(--hi-line)]' : ''}>
              <NdflRateSelector
                category={category}
                color={getTypeColor(category)}
                rate={categoryRate}
                onChange={(rate) => updateNdflRate(category, rate)}
              />
              {accounts.length > 0 && (
                <div className="mb-3 ml-[4.5px] border-l border-[var(--hi-line-strong)] pl-4">
                  {accounts.map((account) => (
                    <NdflAccountRateRow
                      key={account.id}
                      account={account.name}
                      category={category}
                      ownRate={accountRates.get(account.id)?.get(category)}
                      categoryRate={categoryRate}
                      onChange={(rate) => updateAccountNdflRate(account.id, category, rate)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </Section>
  );
}
