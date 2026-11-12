/**
 * Sections of the in-app guide «Как устроен Рантье» (`/settings/guide`).
 * Kept apart from the guide's text so a hint can link to a section without pulling the whole
 * guide into its page's chunk. The text itself lives in `src/components/guide/guide-sections.tsx`.
 */

export const GUIDE_PATH = '/settings/guide';

/** `start` is the summary shown above the contents; the other groups are listed in them. */
export const GUIDE_GROUPS = [
  { id: 'start', title: 'Коротко' },
  { id: 'data', title: 'Откуда цифры' },
  { id: 'math', title: 'Как считается' },
  { id: 'edit', title: 'Как менять' },
  { id: 'keep', title: 'Где хранится' },
] as const;

export type GuideGroupId = (typeof GUIDE_GROUPS)[number]['id'];

export const GUIDE_SECTIONS = [
  { id: 'basics', group: 'start', title: 'Главное за минуту', short: 'Главное' },
  { id: 'sources', group: 'data', title: 'Откуда берутся данные', short: 'Источники' },
  { id: 'updates', group: 'data', title: 'Когда данные обновляются', short: 'Обновление' },
  { id: 'gaps', group: 'data', title: 'Чего приложение не знает', short: 'Чего нет' },
  { id: 'income', group: 'math', title: 'Как считается доход', short: 'Доход' },
  { id: 'income-modes', group: 'math', title: 'По выплатам или своя сумма', short: 'Своя сумма' },
  { id: 'tax', group: 'math', title: 'Налог и валюта', short: 'Налог и валюта' },
  { id: 'screens', group: 'math', title: 'Доходность, капитал, цель, график', short: 'Доходность и график' },
  { id: 'goal', group: 'math', title: 'Цель и прогноз', short: 'Цель и прогноз' },
  { id: 'calendar', group: 'math', title: 'Календарь выплат', short: 'Календарь' },
  { id: 'editing', group: 'edit', title: 'Как менять данные', short: 'Правки' },
  { id: 'import', group: 'edit', title: 'Импорт отчёта брокера', short: 'Импорт' },
  { id: 'storage', group: 'keep', title: 'Где хранится портфель', short: 'Хранение' },
  { id: 'backup', group: 'keep', title: 'Бэкап и новый телефон', short: 'Бэкап' },
] as const satisfies readonly { id: string; group: GuideGroupId; title: string; short: string }[];

export type GuideSectionId = (typeof GUIDE_SECTIONS)[number]['id'];

/** DOM id of a section on the guide page (prefixed, so it can't clash with other ids). */
export function guideElementId(id: GuideSectionId): string {
  return `guide-${id}`;
}

/** Route to the guide, optionally opened at a section: `/settings/guide#income`. */
export function guidePath(id?: GuideSectionId): string {
  return id ? `${GUIDE_PATH}#${id}` : GUIDE_PATH;
}

/** Section named by a location hash (`#income`), if it is one of ours. */
export function sectionFromHash(hash: string): GuideSectionId | null {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  return GUIDE_SECTIONS.some((s) => s.id === id) ? (id as GuideSectionId) : null;
}
