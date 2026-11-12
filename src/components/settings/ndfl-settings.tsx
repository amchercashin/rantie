import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { DEFAULT_NDFL_RATE, updateNdflRate } from '@/services/app-settings';
import type { Account, Holding } from '@/models/account';
import type { Asset } from '@/models/types';
import { Card, Section } from '@/components/ds/surface';
import { NdflRateSelector } from './ndfl-rate-selector';

export interface NdflAccountRow {
  id: number;
  name: string;
  /** Categories the account holds, e.g. "Акции · Облигации". */
  holds: string;
}

/** Every account in the order of the Счета tab, with what it holds — follows the portfolio live. */
export function ndflAccountRows(accounts: Account[], holdings: Holding[], assets: Asset[]): NdflAccountRow[] {
  const typeByAsset = new Map(assets.filter((a) => a.id != null).map((a) => [a.id!, a.type]));
  return accounts
    .filter((a) => a.id != null)
    .map((account) => {
      const types = new Set<string>();
      for (const h of holdings) {
        if (h.accountId !== account.id) continue;
        const type = typeByAsset.get(h.assetId);
        if (type != null) types.add(type);
      }
      return { id: account.id!, name: account.name, holds: [...types].sort().join(' · ') };
    });
}

export function NdflSettings() {
  const rows = useLiveQuery(async () => {
    const [accounts, holdings, assets] = await Promise.all([db.accounts.toArray(), db.holdings.toArray(), db.assets.toArray()]);
    return ndflAccountRows(accounts, holdings, assets);
  }, []);
  const ndflRates = useNdflRates();

  if (!rows || rows.length === 0) return null;

  return (
    <Section
      title="НДФЛ с дохода"
      description="Выплаты хранятся до налога. Доход и доходность считаются после применения ставки."
    >
      <p className="mb-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
        Ставка задаётся для счёта целиком. По умолчанию 13% — так облагаются дивиденды, купоны и проценты по
        вкладам у большинства. 15% — если инвестиционный доход больше 2,4 млн ₽ в год, 0% — ИИС с налоговой
        льготой, 4% — аренда как самозанятый (удобно держать аренду в отдельном счёте).
      </p>
      <Card className="overflow-hidden px-4">
        {rows.map((row, i) => (
          <div key={row.id} className={i > 0 ? 'border-t border-[var(--hi-line)]' : ''}>
            <NdflRateSelector
              name={row.name}
              subtitle={row.holds || 'Пока пусто'}
              rate={ndflRates.get(row.id) ?? DEFAULT_NDFL_RATE}
              onChange={(rate) => updateNdflRate(row.id, rate)}
            />
          </div>
        ))}
      </Card>
    </Section>
  );
}
