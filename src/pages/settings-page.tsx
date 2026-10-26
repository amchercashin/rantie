import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Lightbulb, Sparkles, Trash2, Upload } from 'lucide-react';
import { withViewTransition } from '@/lib/view-transition';
import { AppShell } from '@/components/layout/app-shell';
import { Card, ListRow, Section } from '@/components/ds/surface';
import { BrandMark, Wordmark } from '@/components/ds/brand-mark';
import { useFeedback } from '@/components/ds/feedback';
import { clearAllData } from '@/services/app-settings';
import { importAllData } from '@/services/backup';
import { downloadBackup } from '@/lib/download-backup';
import { formatBackupAge, getLastBackupAt } from '@/lib/backup-reminder';
import { removeDemoPortfolio } from '@/services/demo-portfolio';
import { resetHints } from '@/lib/hints';
import { useDemoAccountId } from '@/hooks/use-demo';
import { NdflSettings } from '@/components/settings/ndfl-settings';
import { ExchangeRatesSettings } from '@/components/settings/exchange-rates-settings';
import { PrivacyCard } from '@/components/settings/privacy-card';
import { StorageStatusRow } from '@/components/settings/storage-status';

function RowIcon({ children, tone = 'gold' }: { children: React.ReactNode; tone?: 'gold' | 'danger' }) {
  return (
    <span
      className={
        tone === 'gold'
          ? 'inline-flex size-9 items-center justify-center rounded-xl bg-[var(--hi-gold-tint)] text-[var(--hi-gold)] [&_svg]:size-[18px]'
          : 'inline-flex size-9 items-center justify-center rounded-xl bg-[var(--hi-negative-tint)] text-[var(--hi-negative)] [&_svg]:size-[18px]'
      }
    >
      {children}
    </span>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const fileRef = useRef<HTMLInputElement>(null);
  const demoAccountId = useDemoAccountId();
  const [lastBackupAt, setLastBackupAt] = useState(getLastBackupAt);

  const handleExport = async () => {
    await downloadBackup();
    setLastBackupAt(getLastBackupAt());
    toast('Бэкап сохранён');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const json = await file.text();
      JSON.parse(json);
      const ok = await confirm({
        title: 'Восстановить из бэкапа?',
        description: 'Все текущие данные будут заменены данными из файла.',
        confirmLabel: 'Восстановить',
        destructive: true,
      });
      if (!ok) return;
      await importAllData(json);
      toast('Данные восстановлены');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Ошибка: невалидный JSON файл', 'error');
    }
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: 'Удалить все данные?',
      description: 'Счета, активы, выплаты и настройки будут удалены с этого устройства. Отменить нельзя — сначала сохраните бэкап.',
      confirmLabel: 'Удалить всё',
      destructive: true,
    });
    if (!ok) return;
    await clearAllData();
    toast('Данные удалены', 'info');
    withViewTransition(() => navigate('/'), 'tab');
  };

  return (
    <AppShell title="Настройки">
      <NdflSettings />

      <ExchangeRatesSettings />

      <Section title="Данные" description="Бэкап — единственный способ перенести портфель на другой телефон или вернуть его, если браузер очистит данные.">
        <Card className="overflow-hidden">
          <StorageStatusRow />
          <ListRow
            leading={<RowIcon><Download /></RowIcon>}
            title="Скачать бэкап"
            subtitle={`Последний: ${formatBackupAge(lastBackupAt)}`}
            chevron
            onClick={handleExport}
          />
          <ListRow leading={<RowIcon><Upload /></RowIcon>} title="Восстановить из бэкапа" subtitle="Заменит текущие данные" chevron onClick={() => fileRef.current?.click()} />
        </Card>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" />
      </Section>

      <PrivacyCard />

      <Section title="Обучение">
        <Card className="overflow-hidden">
          <ListRow
            leading={<RowIcon><Lightbulb /></RowIcon>}
            title="Показать подсказки снова"
            subtitle="Приветствие и советы на экранах"
            onClick={() => {
              resetHints();
              toast('Подсказки вернутся при следующем открытии экранов', 'info');
            }}
          />
          {demoAccountId != null && (
            <ListRow
              leading={<RowIcon><Sparkles /></RowIcon>}
              title="Удалить демо-портфель"
              subtitle="Ваши собственные счета не затронутся"
              onClick={async () => {
                await removeDemoPortfolio();
                toast('Демо-данные удалены');
              }}
            />
          )}
        </Card>
      </Section>

      <Section title="Опасная зона">
        <Card className="overflow-hidden border-[rgba(224,122,107,0.18)]">
          <ListRow
            leading={<RowIcon tone="danger"><Trash2 /></RowIcon>}
            title={<span className="text-[var(--hi-negative)]">Удалить все данные</span>}
            subtitle="Необратимо"
            onClick={handleClear}
          />
        </Card>
      </Section>

      <div className="mt-12 flex flex-col items-center text-center">
        <BrandMark framed className="size-14" />
        <Wordmark className="mt-3 text-[26px]" />
        <div className="mt-1.5 text-[length:var(--hi-text-caption)] text-[var(--hi-text-3)]">Капитал, который платит</div>
        <div className="mt-1 text-[length:var(--hi-text-micro)] text-[var(--hi-text-3)]">
          Данные: Мосбиржа, dohod.ru · работает офлайн
        </div>
      </div>
    </AppShell>
  );
}
