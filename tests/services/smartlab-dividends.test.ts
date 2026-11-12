import { describe, it, expect } from 'vitest';
import { refineForecasts, smartlabAsMain } from '@/services/smartlab-dividends';
import type { DohodDividendRow, SmartlabDividendRow } from '@/services/heroincome-data';

const NOW = new Date('2026-11-12T12:00:00Z');
const d = (iso: string) => new Date(iso);
const dohod = (iso: string, amount: number, isForecast = true): DohodDividendRow => ({ date: d(iso), amount, isForecast });
const sl = (iso: string, amount: number, status: SmartlabDividendRow['status']): SmartlabDividendRow => ({ date: d(iso), amount, status });

describe('refineForecasts — dohod.ru stays the source, smart-lab refines what is coming', () => {
  it('marks the forecast recommended when smart-lab has the same date and amount', () => {
    const res = refineForecasts(
      [dohod('2026-07-04', 278, false), dohod('2026-12-09', 535), dohod('2027-05-04', 550)],
      [sl('2026-12-09', 535, 'recommended'), sl('2026-05-04', 278, 'paid')],
      NOW,
    );
    expect(res.smartlab).toEqual([]);
    expect(res.dohod).toEqual([
      { date: d('2026-07-04'), amount: 278, isForecast: false },
      { date: d('2026-12-09'), amount: 535, isForecast: true, recommended: true },
      { date: d('2027-05-04'), amount: 550, isForecast: true },
    ]);
  });

  it('replaces a forecast that differs from the recommendation, two dividends of one date included', () => {
    // dohod.ru: one forecast of 9,80 ₽; the board recommended 5,59 + 4,21 ₽ for the same date.
    const res = refineForecasts(
      [dohod('2026-12-21', 9.8), dohod('2027-07-11', 4.93)],
      [sl('2026-12-21', 5.59, 'recommended'), sl('2026-12-21', 4.21, 'recommended')],
      NOW,
    );
    expect(res.dohod).toEqual([{ date: d('2027-07-11'), amount: 4.93, isForecast: true }]);
    expect(res.smartlab).toEqual([
      { date: d('2026-12-21'), amount: 5.59, isForecast: true, recommended: true },
      { date: d('2026-12-21'), amount: 4.21, isForecast: true, recommended: true },
    ]);
  });

  it('matches a recommendation with the forecast of a nearby date, not a later one', () => {
    const res = refineForecasts(
      [dohod('2027-01-20', 9.41), dohod('2027-07-09', 19.85)],
      [sl('2027-01-12', 9.44, 'recommended')],
      NOW,
    );
    expect(res.dohod).toEqual([{ date: d('2027-07-09'), amount: 19.85, isForecast: true }]);
    expect(res.smartlab).toEqual([{ date: d('2027-01-12'), amount: 9.44, isForecast: true, recommended: true }]);
  });

  it('adds a recommendation dohod.ru has no forecast for', () => {
    const res = refineForecasts([dohod('2027-07-09', 20)], [sl('2026-12-15', 10, 'recommended')], NOW);
    expect(res.dohod).toEqual([{ date: d('2027-07-09'), amount: 20, isForecast: true }]);
    expect(res.smartlab).toEqual([{ date: d('2026-12-15'), amount: 10, isForecast: true, recommended: true }]);
  });

  it('a canceled dividend turns its forecast into «no payment expected»', () => {
    const res = refineForecasts([dohod('2026-12-20', 201)], [sl('2026-12-18', 201, 'canceled')], NOW);
    expect(res.dohod).toEqual([]);
    expect(res.smartlab).toEqual([{ date: d('2026-12-18'), amount: 0, isForecast: true }]);
  });

  it('leaves the past and forecasts alone: only upcoming recommendations and cancellations count', () => {
    const rows = [dohod('2025-07-05', 201, false), dohod('2027-03-01', 30)];
    const res = refineForecasts(
      rows,
      [sl('2025-07-05', 201, 'canceled'), sl('2026-06-01', 50, 'recommended'), sl('2027-03-01', 31, 'forecast')],
      NOW,
    );
    expect(res).toEqual({ dohod: rows, smartlab: [] });
  });

  it('does not add a recommendation dohod.ru already has as a payment with a shifted date', () => {
    // Мосбиржа: dohod.ru has the 2023 dividend on 13.05.2024, smart-lab on 14.06.2024. Between the two
    // dates the recommendation would be added next to the repeated payment: the calendar counts it twice.
    const res = refineForecasts(
      [dohod('2026-10-30', 20, false)],
      [sl('2026-12-01', 20, 'recommended')],
      NOW,
    );
    expect(res).toEqual({ dohod: [{ date: d('2026-10-30'), amount: 20, isForecast: false }], smartlab: [] });
  });

  it('does not add a recommendation when dohod.ru already has that payment dated ahead', () => {
    const res = refineForecasts([dohod('2026-12-09', 535, false)], [sl('2026-12-09', 535, 'recommended')], NOW);
    expect(res).toEqual({ dohod: [{ date: d('2026-12-09'), amount: 535, isForecast: false }], smartlab: [] });
  });

  it('does not change the rows it was given', () => {
    const rows = [dohod('2026-12-09', 535)];
    refineForecasts(rows, [sl('2026-12-09', 535, 'recommended')], NOW);
    expect(rows[0]).toEqual({ date: d('2026-12-09'), amount: 535, isForecast: true });
  });
});

describe('smartlabAsMain — smart-lab as the only source of a stock', () => {
  it('maps statuses to payments and forecasts', () => {
    expect(
      smartlabAsMain(
        [
          sl('2026-12-15', 15.11, 'recommended'),
          sl('2027-06-01', 16, 'forecast'),
          sl('2027-07-01', 17, 'expected'),
          sl('2027-01-20', 3, 'canceled'),
          sl('2026-06-15', 14, 'paid'),
          sl('2025-07-05', 201, 'canceled'),
          sl('2025-12-15', 13, 'paid'),
        ],
        NOW,
      ),
    ).toEqual([
      { date: d('2026-12-15'), amount: 15.11, isForecast: true, recommended: true },
      { date: d('2027-06-01'), amount: 16, isForecast: true },
      { date: d('2027-07-01'), amount: 17, isForecast: true },
      { date: d('2027-01-20'), amount: 0, isForecast: true },
      { date: d('2026-06-15'), amount: 14 },
      { date: d('2025-12-15'), amount: 13 },
    ]);
  });

  it('a recommendation whose register has already closed is a payment', () => {
    expect(smartlabAsMain([sl('2026-11-10', 7, 'recommended')], NOW)).toEqual([{ date: d('2026-11-10'), amount: 7 }]);
  });

  it('drops forecasts that are already past', () => {
    expect(smartlabAsMain([sl('2026-10-01', 5, 'forecast'), sl('2026-10-02', 5, 'expected')], NOW)).toEqual([]);
  });
});
