import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { DEFAULT_NDFL_RATE, updateNdflRate } from '@/services/app-settings';
import { getTypeColor } from '@/models/account';
import { formatRate } from '@/lib/utils';
import { Card, Section } from '@/components/ds/surface';
import { NdflRateSelector } from './ndfl-rate-selector';

export function NdflSettings() {
  const categories = useLiveQuery(async () => {
    const assets = await db.assets.toArray();
    const types = new Set(assets.map((a) => a.type));
    return [...types].sort();
  }, []);

  const ndflRates = useNdflRates();
  // Accounts with their own rate: for their holdings the category rates below don't apply.
  const ownRates = useLiveQuery(async () => {
    const accounts = await db.accounts.toArray();
    return accounts.filter((a) => typeof a.ndflRate === 'number').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, []);

  if (!categories || categories.length === 0) return null;

  return (
    <Section
      title="НДФЛ с дохода"
      description="Выплаты хранятся до налога. Доход и доходность считаются после применения ставки."
    >
      <p className="mb-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
        По умолчанию 13% — так облагаются дивиденды, купоны и проценты по вкладам у большинства. 15% — если
        инвестиционный доход больше 2,4 млн ₽ в год, 4% — аренда как самозанятый. Для ИИС с налоговой льготой
        поставьте 0% самому счёту: «Счета» → ⋯ → НДФЛ.
      </p>
      <Card className="overflow-hidden px-4">
        {categories.map((type, i) => (
          <div key={type} className={i > 0 ? 'border-t border-[var(--hi-line)]' : ''}>
            <NdflRateSelector
              category={type}
              color={getTypeColor(type)}
              rate={ndflRates.get(type) ?? DEFAULT_NDFL_RATE}
              onChange={(rate) => updateNdflRate(type, rate)}
            />
          </div>
        ))}
      </Card>
      {ownRates && ownRates.length > 0 && (
        <p className="mt-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
          {ownRates.length === 1 ? 'Своя ставка у счёта ' : 'Свои ставки у счетов '}
          {ownRates.map((a) => `«${a.name}» — ${formatRate(a.ndflRate!)}`).join(', ')}. Для их позиций ставки выше не
          действуют. Изменить: «Счета» → ⋯ → НДФЛ.
        </p>
      )}
    </Section>
  );
}
