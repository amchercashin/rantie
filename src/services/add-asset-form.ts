import type { Asset } from '@/models/types';
import { EXCHANGE_TYPES } from '@/models/asset-kind';
import { createAssetDraft } from './asset-factory';

/** Which set of fields the "add asset" form shows for a category. */
export type AddAssetKind = 'security' | 'deposit' | 'realty' | 'other';

export function addAssetKindOf(type: string): AddAssetKind {
  if ((EXCHANGE_TYPES as readonly string[]).includes(type)) return 'security';
  if (type === 'Вклады') return 'deposit';
  if (type === 'Недвижимость') return 'realty';
  return 'other';
}

export interface AddAssetForm {
  type: string;
  name: string;
  ticker: string;
  currency: string;
  /** security / other: number of units */
  quantity: number;
  /** security / other: total purchase cost */
  totalCost?: number;
  /** deposit: deposit amount; realty: property value; other: current price per unit */
  value?: number;
  /** deposit: annual rate, % */
  ratePercent?: number;
  /** realty: monthly rent */
  monthlyRent?: number;
  /** other: annual income per unit */
  annualIncome?: number;
}

export interface AddAssetResult {
  asset: Omit<Asset, 'id'>;
  quantity: number;
  averagePrice?: number;
}

const valid = (n: number | undefined): n is number => n != null && Number.isFinite(n);

/**
 * Turns the form into an asset draft + holding numbers.
 * Deposits and rentals get a manual annual income per unit, paid monthly,
 * so the income appears immediately without recording payments.
 */
export function buildAssetFromForm(form: AddAssetForm, now: Date = new Date()): AddAssetResult {
  const kind = addAssetKindOf(form.type);
  const ticker = kind === 'security' ? form.ticker.trim().toUpperCase() : '';
  const name = form.name.trim() || ticker;

  if (kind === 'deposit' || kind === 'realty') {
    const value = valid(form.value) ? form.value : undefined;
    const annualIncome = kind === 'deposit'
      ? (value != null && valid(form.ratePercent) ? (value * form.ratePercent) / 100 : undefined)
      : (valid(form.monthlyRent) ? form.monthlyRent * 12 : undefined);
    return {
      asset: createAssetDraft({
        type: form.type,
        name,
        currency: form.currency,
        currentPrice: value,
        dataSource: 'manual',
        paymentPerUnit: annualIncome,
        paymentPerUnitSource: annualIncome != null ? 'manual' : 'fact',
        frequencyPerYear: 12,
        frequencySource: 'manual',
        now,
      }),
      quantity: 1,
      averagePrice: value,
    };
  }

  // The "other" form shows «1» as the placeholder, so an empty field means one unit, not zero.
  const quantity = valid(form.quantity)
    ? Math.max(form.quantity, 0)
    : kind === 'other' ? 1 : 0;
  const averagePrice = valid(form.totalCost) ? (quantity > 0 ? form.totalCost / quantity : form.totalCost) : undefined;
  const currentPrice = kind === 'other' && valid(form.value) ? form.value : averagePrice;
  const annualIncome = kind === 'other' && valid(form.annualIncome) ? form.annualIncome : undefined;

  return {
    asset: createAssetDraft({
      type: form.type,
      ticker: ticker || undefined,
      name,
      currency: form.currency,
      currentPrice,
      dataSource: 'manual',
      paymentPerUnit: annualIncome,
      paymentPerUnitSource: annualIncome != null ? 'manual' : 'fact',
      frequencySource: 'manual',
      now,
    }),
    quantity,
    averagePrice,
  };
}
