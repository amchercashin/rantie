import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone = 'gold' | 'neutral' | 'positive' | 'info' | 'violet' | 'negative';

const TONES: Record<BadgeTone, string> = {
  gold: 'bg-[var(--hi-gold-tint)] text-[var(--hi-gold)]',
  neutral: 'bg-[rgba(236,220,190,0.06)] text-[var(--hi-text-2)]',
  positive: 'bg-[var(--hi-positive-tint)] text-[var(--hi-positive)]',
  info: 'bg-[var(--hi-info-tint)] text-[var(--hi-info)]',
  violet: 'bg-[var(--hi-violet-tint)] text-[var(--hi-violet)]',
  negative: 'bg-[var(--hi-negative-tint)] text-[var(--hi-negative)]',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: BadgeTone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[length:var(--hi-text-micro)] font-semibold leading-none whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Where a number came from. One vocabulary for the whole app. */
export type SourceKind = 'fact' | 'manual' | 'moex' | 'dohod' | 'smartlab' | 'parus' | 'import' | 'forecast' | 'recommended' | 'error';

const SOURCE: Record<SourceKind, { label: string; tone: BadgeTone; title: string }> = {
  fact: { label: 'факт', tone: 'gold', title: 'Рассчитано по фактическим выплатам за 12 месяцев' },
  manual: { label: 'вручную', tone: 'neutral', title: 'Значение указано вручную' },
  moex: { label: 'MOEX', tone: 'positive', title: 'Данные Московской биржи' },
  dohod: { label: 'dohod.ru', tone: 'info', title: 'Данные dohod.ru' },
  smartlab: { label: 'smart-lab', tone: 'violet', title: 'Данные smart-lab.ru' },
  parus: { label: 'Парус', tone: 'violet', title: 'Данные управляющей компании «Парус»' },
  import: { label: 'импорт', tone: 'neutral', title: 'Из брокерского отчёта' },
  forecast: { label: 'прогноз', tone: 'neutral', title: 'Ожидаемая выплата, ещё не состоялась' },
  recommended: { label: 'рекомендовано', tone: 'positive', title: 'Совет директоров рекомендовал этот дивиденд (по данным smart-lab). Собрание акционеров ещё может его изменить' },
  error: { label: 'ошибка', tone: 'negative', title: 'Не удалось обновить данные' },
};

export function SourceBadge({ source, className }: { source: SourceKind; className?: string }) {
  const meta = SOURCE[source] ?? SOURCE.manual;
  return (
    <Badge tone={meta.tone} title={meta.title} className={className}>
      {meta.label}
    </Badge>
  );
}

/**
 * Marks an amount as net of personal income tax — or, when no rate is set (0%),
 * honestly as gross, so the label never promises a deduction that was not made.
 */
export function NetOfTaxBadge({ className, taxed = true }: { className?: string; taxed?: boolean }) {
  return (
    <Badge
      tone="neutral"
      className={className}
      title={taxed ? 'Суммы показаны за вычетом НДФЛ по ставкам из настроек' : 'Ставка НДФЛ не задана — суммы до налога. Ставку можно указать в настройках'}
    >
      {taxed ? 'после НДФЛ' : 'до НДФЛ'}
    </Badge>
  );
}
