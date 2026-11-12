import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Non-breaking space — keeps "47 054 ₽" on one line. */
export const NBSP = ' ';
const DASH = '—';

function groupDigits(value: number, maxFractionDigits = 0): string {
  return value
    .toLocaleString('ru-RU', { maximumFractionDigits: maxFractionDigits, minimumFractionDigits: 0 })
    .replace(/\s/g, NBSP);
}

/** "1,5" — one decimal, dropped when it is zero. */
function oneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return groupDigits(rounded, 1);
}

/**
 * Compact number without currency: 850, "12 тыс", "1,5 млн", "2,1 млрд".
 * Values under 10 000 keep one decimal in thousands ("1,2 тыс").
 */
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${oneDecimal(abs / 1_000_000_000)}${NBSP}млрд`;
  if (abs >= 1_000_000) return `${sign}${oneDecimal(abs / 1_000_000)}${NBSP}млн`;
  if (abs >= 10_000) return `${sign}${groupDigits(Math.round(abs / 1_000))}${NBSP}тыс`;
  if (abs >= 1_000) return `${sign}${oneDecimal(abs / 1_000)}${NBSP}тыс`;
  return `${sign}${groupDigits(Math.round(abs))}`;
}

/** Compact rubles: "500 ₽", "12 тыс ₽", "1,5 млн ₽". */
export function formatCurrency(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return DASH;
  return `${formatCompactNumber(value)}${NBSP}₽`;
}

/** Income amounts: exact below 100 000 ("4 145 ₽"), compact above ("1,2 млн ₽"). */
export function formatIncome(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return DASH;
  return Math.abs(value) < 100_000 ? formatCurrencyFull(value) : formatCurrency(value);
}

/** Full rubles, rounded: "47 054 ₽". */
export function formatCurrencyFull(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return DASH;
  return `${groupDigits(Math.round(value))}${NBSP}₽`;
}

function currencySuffix(currency?: string): string {
  const normalized = (currency ?? '').trim().toUpperCase() || 'RUB';
  return normalized === 'RUB' ? '₽' : normalized;
}

/** Whole amount in its own currency: "312 ₽", "100 USD". */
export function formatMoney(value: number | null | undefined, currency = 'RUB'): string {
  if (value == null || !isFinite(value)) return DASH;
  return `${groupDigits(Math.round(value))}${NBSP}${currencySuffix(currency)}`;
}

/** Price with kopecks where they matter: "312,4 ₽", "6 980 ₽", "0,85 USD". */
export function formatPrice(value: number | null | undefined, currency = 'RUB'): string {
  if (value == null || !isFinite(value)) return DASH;
  const digits = Math.abs(value) >= 1000 ? 0 : 2;
  return `${groupDigits(value, digits)}${NBSP}${currencySuffix(currency)}`;
}

/** "7,5%" */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return DASH;
  return `${(Math.round(value * 10) / 10).toFixed(1).replace('.', ',')}%`;
}

/** Compact number for chart annotations: "52", "1,2 тыс", "85 тыс". */
export function formatCompact(value: number): string {
  return formatCompactNumber(value);
}

/** Plain grouped number: "1 000", "12,5". */
export function formatNumber(value: number | null | undefined, maxFractionDigits = 2): string {
  if (value == null || !isFinite(value)) return DASH;
  return groupDigits(value, maxFractionDigits);
}

/** Russian plural: plural(5, ['позиция', 'позиции', 'позиций']) → "позиций". */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

export function formatFrequency(perYear: number): string {
  if (perYear === 12) return 'ежемесячно';
  if (perYear === 4) return 'ежеквартально';
  if (perYear === 2) return 'раз в полгода';
  if (perYear === 1) return 'раз в год';
  if (perYear <= 0) return 'нет выплат';
  return `${perYear} ${plural(perYear, ['раз', 'раза', 'раз'])} в год`;
}

/** "18 июл" */
export function formatShortDate(date: Date): string {
  return new Date(date)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** "18 июля 2026" */
export function formatLongDate(date: Date): string {
  return new Date(date)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(' г.', '');
}

/** "18.07.2026" */
export function formatNumericDate(date: Date): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "только что", "5 мин назад", "3 ч назад", "12 сен" */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes}${NBSP}мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}ч назад`;
  return formatShortDate(date);
}
