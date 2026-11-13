import type { ProjectedPayment } from '@/services/income-projection';

/** Why a payment is expected — one vocabulary for the calendar, the upcoming list and the asset page. */
export const BASIS_LABEL: Record<ProjectedPayment['basis'], string> = {
  forecast: 'прогноз',
  recommended: 'рекомендовано',
  scheduled: 'ожидается',
  'last-year': 'как год назад',
  average: 'средняя выплата',
  'last-payout': 'как последняя выплата',
  fixed: 'ваша сумма',
};

/** «как год назад», «ваша сумма · дата условная»… */
export function basisLabel(payment: Pick<ProjectedPayment, 'basis' | 'estimated'>): string {
  return payment.estimated ? `${BASIS_LABEL[payment.basis]} · дата условная` : BASIS_LABEL[payment.basis];
}
