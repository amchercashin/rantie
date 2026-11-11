# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # TypeScript check + production build
npm run test       # Vitest (all tests)
npx vitest run tests/services/income-calculator.test.ts  # Single test file
npm run test:e2e   # Playwright smoke tests (set PW_CHROMIUM=/path/to/chromium to use a preinstalled browser, e.g. "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
```

## Architecture

**Рантье** (repo/deploy name `rantie`, formerly `heroincome`) — local-first PWA for tracking passive income from stocks, bonds, deposits, real estate, and funds. No backend — all data stored in IndexedDB via Dexie. External reads: MOEX ISS API for prices/dividends, heroincome-data repo (dohod.ru) for stock dividends with priority over MOEX.

**Stack:** React 19 + React Router v7 (SPA) + Dexie (IndexedDB) + Tailwind v4 + Radix Dialog (bottom sheets) + vite-plugin-pwa + Vitest

### Data flow

```
MOEX API / Import files → services/ (pure parsing) → Dexie DB → useLiveQuery hooks → React components
                                                        ↑
                                                   User edits (inline)
```

- **`src/models/types.ts`** — all domain types. `Asset` is the central entity with source-tracking fields (`paymentPerUnitSource`, `frequencySource`, `quantitySource`) distinguishing calculated/imported values from manual overrides.
- **`src/db/database.ts`** — Dexie schema with versioned migrations; `db.settings` is the typed key–value table (`AppSetting`), use it instead of `db.table('settings')`. V4 merged PaymentSchedule into Asset; understand the upgrade function before adding fields.
- **`src/models/asset-kind.ts`** — `isExchangeTraded()` and `incomeSpreadOf()` (how payments are spread into monthly "pockets", see below).
- **`src/services/`** — pure functions: `income-calculator.ts` (income math), `income-projection.ts` (12-month cash-flow projection, monthly income timeline history + forecast, upcoming payments), `demo-portfolio.ts` (sample portfolio in its own account), `add-asset-form.ts` (type-aware "add asset" form → asset draft), `moex-api.ts` (API parsing), `moex-sync.ts` (orchestration), `heroincome-data.ts` (dohod.ru dividend fetch), `moex-enrich.ts` (price/dividend enrichment), `import-*.ts` (CSV/HTML/markdown parsing + diffing), `sber-html-parser.ts` (Sberbank report parsing), `app-settings.ts` (NDFL rates, general settings), `backup.ts` (JSON export/import).
- **`src/hooks/`** — reactive data layer via `useLiveQuery`. `usePortfolioStats()` is the heaviest computation (snapshot + projection; pass `{ withTimeline: true }` for the income chart). `useNdflRates()` provides reactive NDFL tax rates. `useInstallPrompt()` decides whether to invite the user to install the app (see Install invitation).
- **`src/contexts/`** — `sync-context.tsx` (MOEX sync: `syncing`, `lastSyncAt`, `triggerSync()`, `syncAsset()`). It loads `moex-sync` with a dynamic `import()` when a sync actually runs; the timestamps it reads at startup live in the small `services/sync-state.ts`. Keep it that way — a static import pulls MOEX, dohod and rates code into the first load.
- **`src/pages/`** — one file per route. Tabs: `/` Доход, `/payments` Выплаты (calendar + history), `/data` Счета, `/settings` Настройки; `/category/:type` and `/asset/:id` are pushed under Доход. Numbers are edited in bottom sheets (`IncomeAmountSheet`, `HoldingSheet`), not inline cells. The asset page is the single place that decides how income is counted: «По выплатам» (from payment history) or «Своя сумма» (manual `paymentPerUnit`, entered per month or per year); the Выплаты tab only records payments and warns when they are ignored.
- **`src/components/ds/`** — the design system: `Button`/`IconButton`, `Card`/`Section`/`ListRow`/`Stat`/`EmptyState`/`AssetAvatar`, `Badge`/`SourceBadge`, `Segmented`, `BottomSheet` (Radix dialog; swipe down to close on touch screens via `useSwipeToDismiss` — closes through `onOpenChange(false)` like the ✕, never starts from text fields or while the content is scrolled down; `data-sheet-no-drag` opts an element out), `Field`/`TextInput`/`SelectInput` + `parseDecimal` (`autoFocus` on `TextInput`/`TextArea` works only with a mouse — see iOS hardening), `Hint` (inline dismissible coach mark), `BrandMark`/`Wordmark`, `FeedbackProvider` → `useFeedback()` for `toast()` and promise-based `confirm()`. Never use `window.confirm`/`alert`.
- **`src/components/onboarding/welcome.tsx`** — first-launch welcome slides ending with Import / Manual / Demo. Persistence for welcome + hints lives in `src/lib/hints.ts` (`rt-welcome-done`, `rt-hint-*`).
- **Backup reminder & privacy** — `src/lib/backup-reminder.ts` (pure `shouldRemindBackup`, dates in `rt-last-backup` / `rt-backup-snooze`), `src/lib/download-backup.ts` (the one place that saves a backup file), `useBackupReminder()` drives the nudge on the main page and, once own accounts exist, asks the browser once for persistent storage. `src/lib/storage-protection.ts` wraps `navigator.storage.persist()/persisted()` (`autoRequestProtectionOnce` remembers `rt-persist-asked`, so Firefox prompts at most once on its own) and the pure `describeStorageStatus` behind the "Хранятся в этом браузере…" row at the top of Настройки → Данные (`StorageStatusRow`; iPhone in Safari gets the Home Screen advice, because Safari may wipe site data after about a week without visits). `src/components/settings/privacy-card.tsx` states who sees the portfolio — keep it true to the code: the only network calls are MOEX ISS and heroincome-data on GitHub, carrying tickers/ISINs only.
- **Install invitation** — `InstallCard` (`src/components/install-card.tsx`): a card in the page flow at the end of Доход, never a floating banner (a fixed one covered the last rows). Shown on phones in a browser tab, after the welcome flow, with a portfolio; ✕ hides it for five visits. Android: only while the browser can show its install dialog — `beforeinstallprompt` fires once right after load, so `src/lib/install-prompt.ts` catches it from `main.tsx`, before the lazy main page mounts. iPhone has no such dialog: the button opens `IosInstallGuide` (step screenshots in `public/a2hs/`). Nothing opens on its own.
- **Income goal** — `src/services/income-goal.ts`: one monthly net amount in the `settings` table (`income-goal-month`, so it travels with the backup) and the pure `goalProgress(incomePerMonth, goalPerMonth, period)`, which tells progress as time — days of a month paid for (30 cells) or months of a year (12). `useIncomeGoal()` → number / null (not set) / undefined (loading). UI: `GoalPath` is the lower half of the hero summary card (`IncomeHero footer`), `GoalStrip` draws the cells, `GoalSheet` edits the number with a live preview. The goal is compared with the hero number, so it is net of NDFL whenever the hero is.
- **NDFL labels** — "после НДФЛ" is shown only when the rate for the categories in view is > 0 (13% by default); when the user sets 0% the UI says "до НДФЛ" (`NetOfTaxBadge taxed`, `IncomeHero taxed`).
- **`src/components/ui/`** — only `transition-link.tsx` lives here. The shadcn-generated components were removed as unused (the app's components are `ds/`), together with `shadcn`, `tw-animate-css` and `class-variance-authority`; `components.json` and the shadcn color bridge in `index.css` (`--background`, `--border`, … — the base layer uses them) stay. If a shadcn component is ever added again, bring back `@import "tw-animate-css"` and `@import "shadcn/tailwind.css"` in `index.css`.

### Source-aware income model

Every income-related field on `Asset` tracks its origin:
- `paymentPerUnitSource`: `'fact'` (calculated from payment history) or `'manual'` (user override)
- `frequencySource`: `'moex'` or `'manual'`
- `quantitySource`: `'import'` or `'manual'`
- `ExchangeRate.source`: `'moex'` (indicative rates from MOEX ISS, refreshed by `refreshExchangeRates()` at the start of every sync — even with no exchange-traded assets — and after adding a foreign-currency asset) or `'manual'` (typed in Настройки → Курсы валют, never overwritten; «с биржи» resets it). A foreign asset without a rate is flagged `rateMissing` and left out of the totals; `MissingRateNotice` says so instead of showing 0 ₽.

Manual values override calculated ones. Reset buttons revert to the calculated/imported value.

### Income "pockets" (how a payment becomes monthly income)

`calcAssetAnnualIncomePerUnit(asset, spread, history, now)` is the single entry point; monthly income = annual / 12.
- **Exchange securities** (`isExchangeTraded`: Акции/Облигации/Фонды with a ticker/ISIN) — spread `'year'`: every payment is split into 12 monthly pockets, i.e. annual income = sum of payments over the trailing 12 months. History is the security's own history (MOEX/dohod.ru), so the window is always full and irregular dividends are smoothed. A record dated after today (an announced dividend from MOEX, a payment typed in ahead of time) is not income yet: it is listed among the upcoming payments («ожидается») and starts to count on its date — so the hero number always equals today's point of the chart.
- **Self-recorded income** (rent, deposits, other; `frequencyPerYear > 0`) — spread `'period'`: the latest payout fills a pocket for its own period (12 / frequency months), so monthly rent counts in full at once. The pocket empties when the next payout is overdue by more than half a period (max 45 days). Frequency is editable on the asset page.
- **Timeline / forecast** (`incomeTimeline`) — same formula evaluated month by month for the current quantities: 24 months of history, then 12 months of forecast built from forecasts (`isForecast`, e.g. dohod.ru), otherwise last year's payments repeated. `projectIncome` gives the dated payments (calendar, upcoming list); without forecasts it sums exactly to the yearly income. No source says whether a future dividend is only forecast, recommended by the board or approved by the AGM (dohod.ru keeps even approved ones as forecast rows without a declared date until the record date), so the UI labels basis `forecast` «прогноз» and never «объявлено»; real records already dated in the future (`scheduled`) read «ожидается».

### Multi-source dividend data

Dividend/distribution history uses source priority: `dohod > moex` for stocks and funds.
- `DataSource` type: `'moex' | 'dohod' | 'import' | 'manual'`
- If dohod.ru covers a stock ticker, only dohod records are stored; old moex dividend records deleted on sync
- If dohod unavailable for a ticker, moex is used as fallback
- Funds (ЗПИФы): heroincome-data fund distributions when available (Parus funds), MOEX as fallback. Uses `amountBeforeTax` and `recordDate`.
- `heroincome-data.ts` fetches from `raw.githubusercontent.com/amchercashin/heroincome-data`; separate caches for stock index (`data/stocks/dohod/`) and fund index (`data/funds/`)
- `isForecast` flag on `PaymentHistory` marks predicted payments (shown on chart, excluded from income calculations)
- **One source per security at a time** (`moex-sync.ts`, "Payment sources"): rows of dohod/Parus and MOEX stored side by side would count every payment twice. When the preferred source is merely unreachable (`isDohodIndexLoaded()` / `isFundIndexLoaded()` false — offline, GitHub blocked — or one file failed to load) and its rows are already stored, they stay and MOEX is not asked. When it no longer lists the security, MOEX takes over and the old rows are deleted only once MOEX has answered. A security with nothing stored falls back to MOEX as before.
- Bonds use moex only (no dohod coverage)

### NDFL tax

Per-category tax rates stored in Dexie `settings` table with `ndfl-{category}` keys. `getNdflRates()` fills every category held with `DEFAULT_NDFL_RATE` (13%) until the user picks a rate — pure calculators treat a missing key as 0%, so the default lives only there. `useNdflRates()` hook provides reactive `Map<string, number>`. Tax multiplier `(1 - rate/100)` applied to income in `usePortfolioStats`, `asset-detail-page`, `category-page`. Settings UI in `src/components/settings/ndfl-rate-selector.tsx`.

### Navigation & View Transitions

Bottom tab bar (`src/components/layout/tab-bar.tsx`) + `AppShell` (large serif title that collapses into the glass header on scroll; `back` prop shows a back chevron with a fallback route).
Page navigation uses the View Transitions API. `withViewTransition(cb, direction)` in `src/lib/view-transition.ts` sets `<html data-nav="forward|back|tab">` so CSS can slide forward/back or crossfade between tabs; the tab bar has its own `view-transition-name` and stays still. `TransitionLink` (with optional `direction`) replaces React Router's `Link` for all in-app navigation. Reduced motion disables all of it.
Jumps within a page use `scrollToWithPeek(target)` (`src/lib/smooth-scroll.ts`), not native `behavior: 'smooth'`: an eased rAF scroll of 0.4–0.7 s that leaves 60px of the content above in view (so it reads as the same page), stops on any touch/wheel/key, and jumps instantly with reduced motion. Tapping Доходность / Капитал on Доход uses it to reach «Ближайшие выплаты» (or «Откуда доход» when there are none).

### Tooling details

- **Tailwind v4** — no `tailwind.config` file. All theme config is in `src/index.css` via `@theme inline` + `@tailwindcss/vite` plugin. Class names are collected only from `src/` and `index.html` (`@import "tailwindcss" source(none)` + `@source`): by default Tailwind scans the whole repository and ships utilities for every class name it meets in docs, plans and this file. A class used from a new place outside `src/` needs its own `@source`.
- **Vitest** — config embedded in `vite.config.ts`. Environment: `happy-dom`, globals enabled. Setup file `tests/setup.ts` imports `fake-indexeddb/auto` and `@testing-library/jest-dom/vitest`.
- **TypeScript** — strict mode with `noUnusedLocals` and `noUnusedParameters`.
- **PWA** — `vite-plugin-pwa` with `registerType: 'prompt'`. User gets update prompt on new deploy, not auto-reload. `PwaUpdatePrompt` also asks the service worker to look for a new version every time the app returns to the foreground — an installed app is rarely loaded anew, so without it a deploy could go unnoticed for days.
- **Chunks** — `vite.config.ts` puts React + React Router and Dexie into chunks of their own (`manualChunks`). They change only when the libraries do, so their file names survive a deploy and the service worker does not download them again; the app's own entry chunk is about 30 kB gzip.
- **Sync writes** — `syncAllAssets` writes the prices of all securities with one `bulkUpdate`: every write to `assets` makes the open screens recalculate the portfolio, so one write means one recalculation (the automatic price refresh at startup is exactly this path).
- **Deploy** — GitHub Pages at subpath `/rantie/` (repo renamed from `heroincome` in Oct 2026). CI sets `BASE_URL=/rantie/` env var; `vite.config.ts` reads it for `base`. Workflow in `.github/workflows/deploy.yml` (Node 22): `npx vitest run` goes before the build, so a red test stops the deploy — main is production. CI runs in UTC; tests must not depend on the local time zone. The old path `/heroincome/` is served by the user-site repo `amchercashin.github.io`: a redirect page plus a self-unregistering `sw.js` that retires the old service worker. Same origin, so IndexedDB/localStorage carry over.

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
- **Dexie transactions** — anything that touches several tables runs in one Dexie transaction: `deleteHolding` / `deleteAccount` (remove the asset and its payments with the last holding), `applyImportPlan`, `importAllData`. An asset is never deleted on its own — it goes with its last holding.
- **localStorage** — through `readStorage` / `writeStorage` (`src/lib/safe-storage.ts`), which never throw: storage can be blocked in the browser settings, and a preference is not worth a crash. Keys start with `rt-`; the few `hi-` keys (`hi-a2hs-*`, `hi-onboarding-done`) are historical and stay, because renaming them would forget the user's choices.
- **iOS hardening** — `viewport-fit=cover` in index.html, `touch-action: manipulation` on html, `font-size: 16px` on all inputs (prevents Safari auto-zoom, which stays after blur and makes the page look wider than the screen; never give an input/textarea/select a smaller text class or a `--hi-text-heading`/`body`/`caption`/`micro` token — `tests/components/form-control-font-size.test.ts` enforces it), an inline script in `index.html` that adds `maximum-scale=1` to the viewport on iOS/iPadOS only (stops focus zoom even when the page rests below 100% — Safari page zoom or shrink-to-fit; Safari still allows pinch zoom, Android keeps the plain viewport; `tests/index-html-viewport.test.ts`), `overflow-x: clip` on `body` (nothing may widen the page, or iOS shrinks it to fit), safe-area insets for bottom sheets, no automatic focus on touch screens (`isTouchPrimary()` in `src/lib/input-device.ts`, `pointer: coarse`: a sheet must be readable before the keyboard covers half of it, so `TextInput`/`TextArea` drop `autoFocus` there and `BottomSheet` focuses itself instead of a field or ✕; a raw `<input>` may only pass `autoFocus={!isTouchPrimary()}` — `tests/components/touch-autofocus.test.tsx` enforces it). Do not remove these.
- **Navigation** — use `TransitionLink` (not `Link`) for in-app navigation; use `withViewTransition(cb, direction)` for programmatic `navigate()` calls.
- **Feedback** — confirmations via `useFeedback().confirm()`, results via `toast()`; first-use explanations via `<Hint id="…">`, not overlays.
- **Docs lookup** — при работе с Dexie, Tailwind v4, React Router v7 и Radix сверяйся с актуальной документацией через context7, а не полагайся на обучающие данные.