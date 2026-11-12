import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useNdflRates } from '@/hooks/use-ndfl-rates';
import { DEFAULT_NDFL_RATE, updateNdflRate } from '@/services/app-settings';
import { getTypeColor } from '@/models/account';
import { Card, Section } from '@/components/ds/surface';
import { NdflRateSelector } from './ndfl-rate-selector';

export function NdflSettings() {
  const categories = useLiveQuery(async () => {
    const assets = await db.assets.toArray();
    const types = new Set(assets.map((a) => a.type));
    return [...types].sort();
  }, []);

  const ndflRates = useNdflRates();

  if (!categories || categories.length === 0) return null;

  return (
    <Section
      title="НДФЛ с дохода"
      description="Выплаты хранятся до налога. Доход и доходность считаются после применения ставки."
    >
      <p className="mb-3 px-1 text-[length:var(--hi-text-micro)] leading-relaxed text-[var(--hi-text-3)]">
        По умолчанию 13% — так облагаются дивиденды, купоны и проценты по вкладам у большинства. 15% — если
        инвестиционный доход больше 2,4 млн ₽ в год, 4% — аренда как самозанятый, 0% — ИИС с налоговой льготой.
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
    </Section>
  );
}
