# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # TypeScript check + production build
npm run test       # Vitest (all tests)
npx vitest run tests/services/income-calculator.test.ts  # Single test file
npm run test:e2e   # Playwright smoke tests (set PW_CHROMIUM=/path/to/chromium to use a preinstalled browser)
```

## Architecture

**Рантье** (repo/deploy name `rantie`, formerly `heroincome`) — local-first PWA for tracking passive income from stocks, bonds, deposits, real estate, and funds. No backend — all data stored in IndexedDB via Dexie. External reads: MOEX ISS API for prices/dividends, heroincome-data repo (dohod.ru) for stock dividends with priority over MOEX.

**Stack:** React 19 + React Router v7 (SPA) + Dexie (IndexedDB) + Tailwind v4 + shadcn/ui + vite-plugin-pwa + Vitest

### Data flow

```
MOEX API / Import files → services/ (pure parsing) → Dexie DB → useLiveQuery hooks → React components
                                                        ↑
                                                   User edits (inline)
```

- **`src/models/types.ts`** — all domain types. `Asset` is the central entity with source-tracking fields (`paymentPerUnitSource`, `frequencySource`, `quantitySource`) distinguishing calculated/imported values from manual overrides.
- **`src/db/database.ts`** — Dexie schema with versioned migrations. V4 merged PaymentSchedule into Asset; understand the upgrade function before adding fields.
- **`src/models/asset-kind.ts`** — `isExchangeTraded()` and `incomeSpreadOf()` (how payments are spread into monthly "pockets", see below).
- **`src/services/`** — pure functions: `income-calculator.ts` (income math), `income-projection.ts` (12-month cash-flow projection, monthly income timeline history + forecast, upcoming payments), `demo-portfolio.ts` (sample portfolio in its own account), `add-asset-form.ts` (type-aware "add asset" form → asset draft), `moex-api.ts` (API parsing), `moex-sync.ts` (orchestration), `heroincome-data.ts` (dohod.ru dividend fetch), `moex-enrich.ts` (price/dividend enrichment), `import-*.ts` (CSV/HTML/markdown parsing + diffing), `sber-html-parser.ts` (Sberbank report parsing), `app-settings.ts` (NDFL rates, general settings), `backup.ts` (JSON export/import).
- **`src/hooks/`** — reactive data layer via `useLiveQuery`. `usePortfolioStats()` is the heaviest computation (snapshot + projection; pass `{ withTimeline: true }` for the income chart). `useNdflRates()` provides reactive NDFL tax rates. `useInstallPrompt()` manages A2HS install prompt lifecycle.
- **`src/contexts/`** — `sync-context.tsx` (MOEX sync: `syncing`, `lastSyncAt`, `triggerSync()`, `syncAsset()`).
- **`src/pages/`** — one file per route. Tabs: `/` Доход, `/payments` Выплаты (calendar + history), `/data` Счета, `/settings` Настройки; `/category/:type` and `/asset/:id` are pushed under Доход. Numbers are edited in bottom sheets (`IncomeAmountSheet`, `HoldingSheet`), not inline cells. The asset page is the single place that decides how income is counted: «По выплатам» (from payment history) or «Своя сумма» (manual `paymentPerUnit`, entered per month or per year); the Выплаты tab only records payments and warns when they are ignored.
- **`src/components/ds/`** — the design system: `Button`/`IconButton`, `Card`/`Section`/`ListRow`/`Stat`/`EmptyState`/`AssetAvatar`, `Badge`/`SourceBadge`, `Segmented`, `BottomSheet` (Radix dialog), `Field`/`TextInput`/`SelectInput` + `parseDecimal`, `Hint` (inline dismissible coach mark), `BrandMark`/`Wordmark`, `FeedbackProvider` → `useFeedback()` for `toast()` and promise-based `confirm()`. Never use `window.confirm`/`alert`.
- **`src/components/onboarding/welcome.tsx`** — first-launch welcome slides ending with Import / Manual / Demo. Persistence for welcome + hints lives in `src/lib/hints.ts` (`rt-welcome-done`, `rt-hint-*`).
- **Backup reminder & privacy** — `src/lib/backup-reminder.ts` (pure `shouldRemindBackup`, dates in `rt-last-backup` / `rt-backup-snooze`), `src/lib/download-backup.ts` (the one place that saves a backup file), `useBackupReminder()` drives the nudge on the main page and, once own accounts exist, asks the browser once for persistent storage. `src/lib/storage-protection.ts` wraps `navigator.storage.persist()/persisted()` (`autoRequestProtectionOnce` remembers `rt-persist-asked`, so Firefox prompts at most once on its own) and the pure `describeStorageStatus` behind the "Хранятся в этом браузере…" row at the top of Настройки → Данные (`StorageStatusRow`; iPhone in Safari gets the Home Screen advice, because Safari may wipe site data after about a week without visits). `src/components/settings/privacy-card.tsx` states who sees the portfolio — keep it true to the code: the only network calls are MOEX ISS and heroincome-data on GitHub, carrying tickers/ISINs only.
- **NDFL labels** — "после НДФЛ" is shown only when the rate for the categories in view is > 0 (13% by default); when the user sets 0% the UI says "до НДФЛ" (`NetOfTaxBadge taxed`, `IncomeHero taxed`).
- **`src/components/ui/`** — shadcn-generated components. Do not edit by hand; use `npx shadcn@latest add <component>`. (`transition-link.tsx` is ours.)

### Source-aware income model

Every income-related field on `Asset` tracks its origin:
- `paymentPerUnitSource`: `'fact'` (calculated from payment history) or `'manual'` (user override)
- `frequencySource`: `'moex'` or `'manual'`
- `quantitySource`: `'import'` or `'manual'`

Manual values override calculated ones. Reset buttons revert to the calculated/imported value.

### Income "pockets" (how a payment becomes monthly income)

`calcAssetAnnualIncomePerUnit(asset, spread, history, now)` is the single entry point; monthly income = annual / 12.
- **Exchange securities** (`isExchangeTraded`: Акции/Облигации/Фонды with a ticker/ISIN) — spread `'year'`: every payment is split into 12 monthly pockets, i.e. annual income = sum of payments over the trailing 12 months. History is the security's own history (MOEX/dohod.ru), so the window is always full and irregular dividends are smoothed.
- **Self-recorded income** (rent, deposits, other; `frequencyPerYear > 0`) — spread `'period'`: the latest payout fills a pocket for its own period (12 / frequency months), so monthly rent counts in full at once. The pocket empties when the next payout is overdue by more than half a period (max 45 days). Frequency is editable on the asset page.
- **Timeline / forecast** (`incomeTimeline`) — same formula evaluated month by month for the current quantities: 24 months of history, then 12 months of forecast built from announced forecasts (`isForecast`), otherwise last year's payments repeated. `projectIncome` gives the dated payments (calendar, upcoming list); without forecasts it sums exactly to the yearly income.

### Multi-source dividend data

Dividend/distribution history uses source priority: `dohod > moex` for stocks and funds.
- `DataSource` type: `'moex' | 'dohod' | 'import' | 'manual'`
- If dohod.ru covers a stock ticker, only dohod records are stored; old moex dividend records deleted on sync
- If dohod unavailable for a ticker, moex is used as fallback
- Funds (ЗПИФы): heroincome-data fund distributions when available (Parus funds), MOEX as fallback. Uses `amountBeforeTax` and `recordDate`.
- `heroincome-data.ts` fetches from `raw.githubusercontent.com/amchercashin/heroincome-data`; separate caches for stock index (`data/stocks/dohod/`) and fund index (`data/funds/`)
- `isForecast` flag on `PaymentHistory` marks predicted payments (shown on chart, excluded from income calculations)
- Bonds use moex only (no dohod coverage)

### NDFL tax

Per-category tax rates stored in Dexie `settings` table with `ndfl-{category}` keys. `getNdflRates()` fills every category held with `DEFAULT_NDFL_RATE` (13%) until the user picks a rate — pure calculators treat a missing key as 0%, so the default lives only there. `useNdflRates()` hook provides reactive `Map<string, number>`. Tax multiplier `(1 - rate/100)` applied to income in `usePortfolioStats`, `asset-detail-page`, `category-page`. Settings UI in `src/components/settings/ndfl-rate-selector.tsx`.

### Navigation & View Transitions

Bottom tab bar (`src/components/layout/tab-bar.tsx`) + `AppShell` (large serif title that collapses into the glass header on scroll; `back` prop shows a back chevron with a fallback route).
Page navigation uses the View Transitions API. `withViewTransition(cb, direction)` in `src/lib/view-transition.ts` sets `<html data-nav="forward|back|tab">` so CSS can slide forward/back or crossfade between tabs; the tab bar has its own `view-transition-name` and stays still. `TransitionLink` (with optional `direction`) replaces React Router's `Link` for all in-app navigation. Reduced motion disables all of it.

### Tooling details

- **Tailwind v4** — no `tailwind.config` file. All theme config is in `src/index.css` via `@theme inline` + `@tailwindcss/vite` plugin.
- **Vitest** — config embedded in `vite.config.ts`. Environment: `happy-dom`, globals enabled. Setup file `tests/setup.ts` imports `fake-indexeddb/auto` and `@testing-library/jest-dom/vitest`.
- **TypeScript** — strict mode with `noUnusedLocals` and `noUnusedParameters`.
- **PWA** — `vite-plugin-pwa` with `registerType: 'prompt'`. User gets update prompt on new deploy, not auto-reload.
- **Deploy** — GitHub Pages at subpath `/rantie/` (repo renamed from `heroincome` in Oct 2026). CI sets `BASE_URL=/rantie/` env var; `vite.config.ts` reads it for `base`. Workflow in `.github/workflows/deploy.yml`. The old path `/heroincome/` is served by the user-site repo `amchercashin.github.io`: a redirect page plus a self-unregistering `sw.js` that retires the old service worker. Same origin, so IndexedDB/localStorage carry over.

### Design system (Рантье)

**Colors** — CSS variables `--hi-*` in `src/index.css` (the `hi` prefix is historical). Surfaces: `--hi-void` (background), `--hi-surface` (cards), `--hi-raised` (sheets, pressed), `--hi-line` / `--hi-line-strong` (hairlines). Text tiers: `--hi-text`, `--hi-text-2`, `--hi-text-3` (tuned for contrast; don't go dimmer). Accents: `--hi-gold` (+ `-bright`, `-deep`, `-tint`, `-glow`), `--hi-positive`, `--hi-negative`, `--hi-info`, `--hi-violet` with `-tint` backgrounds. Category colors live in `KNOWN_TYPE_CONFIG` (`src/models/account.ts`).

**Fonts:** Manrope Variable (sans, UI, tabular figures by default), Cormorant Garamond Variable (serif: titles, hero amount, brand). Both have Cyrillic. Serif titles use lining figures; the hero amount opts into old-style figures via `.hi-numerals-oldstyle`. Helpers: `.hi-eyebrow` (small caps label), `.hi-pressable`, `.hi-glass`, `.hi-card-glow`. Custom keyframes prefixed `hi-`.

**Money formatting** (`src/lib/utils.ts`) — Russian style, ruble sign after the number with a non-breaking space: `formatCurrencyFull` "47 054 ₽", `formatCurrency` "12 тыс ₽" / "1,5 млн ₽", `formatIncome` (exact below 100 тыс), `formatPrice` (kopecks under 1000), `formatPercent` "7,5%", `plural()`.

**Fluid typography** — responsive tokens using `clamp()` in `src/index.css`, scaling between 320px and 430px viewports:

| Token | Range | Usage |
|-------|-------|-------|
| `--hi-text-display` | 48–66px | Hero income sum |
| `--hi-text-large` | 28–36px | Large serif page titles, empty states |
| `--hi-text-nav` | 20–24px | Nav icons |
| `--hi-text-title` | 17–19px | Compact header title |
| `--hi-text-heading` | 15–17px | Values, category names |
| `--hi-text-body` | 13–15px | Body, list rows, buttons |
| `--hi-text-caption` | 12–13px | Secondary lines, labels |
| `--hi-text-micro` | 10.5–11.5px | Eyebrows, chart annotations |

Apply via `text-[length:var(--hi-text-heading)]`. Prefer a token over hardcoded `text-[Xpx]`. Exception: `text-base` (16px) on inputs must stay for iOS zoom prevention.

**Brand** — name «Рантье», monogram = Cormorant «Р» with a ruble crossbar (`BrandMark`; icons in `public/` are generated from the same path). The wordmark (`Wordmark`, also the splash in `index.html`) writes the name with that «Р» as a gold first letter followed by «антье» — use it wherever the name is shown as a title; in running text the name stays plain. IndexedDB name `HeroIncomeDB` and the data repo `heroincome-data` are intentionally unchanged — users never see them, and renaming the DB would lose user data.

## Conventions

- **Russian UI text** — all user-facing strings are in Russian; preserve this when modifying UI.
- **Dark mode only** — hardcoded in `<html class="dark">`, no toggle.
- **Path alias** — `@/*` maps to `src/*`.
- **Tests** — in `tests/` mirroring `src/` structure. Use `fake-indexeddb` for DB tests. Pure function tests dominate; a few component tests in `tests/components/`. Pin the clock (`vi.setSystemTime`) in tests with dates relative to "today".
- **Dexie transactions** — asset mutations (`addAsset`, `updateAsset`, `deleteAsset`) are wrapped in Dexie transactions in `use-assets.ts`.
- **iOS hardening** — `viewport-fit=cover` in index.html, `touch-action: manipulation` on html, `font-size: 16px` on all inputs (prevents Safari auto-zoom), safe-area insets for bottom sheets. Do not remove these.
- **Navigation** — use `TransitionLink` (not `Link`) for in-app navigation; use `withViewTransition(cb, direction)` for programmatic `navigate()` calls.
- **Feedback** — confirmations via `useFeedback().confirm()`, results via `toast()`; first-use explanations via `<Hint id="…">`, not overlays.
- **Docs lookup** — при работе с Dexie, Tailwind v4, React Router v7 и shadcn/ui сверяйся с актуальной документацией через context7, а не полагайся на обучающие данные.
