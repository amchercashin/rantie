export interface ImportAssetRow {
  ticker?: string;
  isin?: string;
  name: string;
  type: string;
  quantity: number;
  averagePrice?: number;
  currentPrice?: number;
  faceValue?: number;
  currency?: string;
  emitter?: string;
  securityCategory?: string;
  issueInfo?: string;
  lastPaymentAmount?: number;
  frequencyPerYear?: number;
  /** Account the position belongs to (AI table «Счёт» column or a «Счёт: …» line above the table). */
  account?: string;
}

const TYPE_MAP: Record<string, string> = {
  акция: 'Акции', акции: 'Акции', stock: 'Акции',
  облигация: 'Облигации', облигации: 'Облигации', bond: 'Облигации',
  фонд: 'Фонды', фонды: 'Фонды', etf: 'Фонды', бпиф: 'Фонды', пиф: 'Фонды', зпиф: 'Фонды', fund: 'Фонды',
  недвижимость: 'Недвижимость', realestate: 'Недвижимость',
  вклад: 'Вклады', вклады: 'Вклады', депозит: 'Вклады', deposit: 'Вклады',
  прочее: 'Прочее', other: 'Прочее',
  валюта: 'Валюта', currency: 'Валюта',
  крипта: 'Крипта', crypto: 'Крипта',
};

export function parseTypeLabel(label: string): string {
  const key = label.trim().toLowerCase();
  const exact = TYPE_MAP[key];
  if (exact) return exact;
  // AI often writes a longer label: "Акция обыкновенная", "Облигация ОФЗ", "БПИФ рыночных финансовых инструментов"
  if (key.startsWith('акци')) return 'Акции';
  if (key.startsWith('облиг')) return 'Облигации';
  if (/фонд|пиф|etf/.test(key)) return 'Фонды';
  return 'Прочее';
}

interface ColumnMap {
  account?: number;
  ticker?: number;
  isin?: number;
  name?: number;
  type?: number;
  quantity?: number;
  averagePrice?: number;
  faceValue?: number;
  currency?: number;
  lastPaymentAmount?: number;
  frequencyPerYear?: number;
}

const HEADER_PATTERNS: [keyof ColumnMap, RegExp][] = [
  // Anchored: "Цена расчёта" must not become the account column
  ['account', /^\s*(?:сч[её]т|account|портфель)/i],
  ['ticker', /тикер|ticker|secid/i],
  ['isin', /isin|исин/i],
  ['name', /назван|name|наименование/i],
  ['type', /тип|type/i],
  ['quantity', /кол[- ]?во|количество|qty|quantity|шт/i],
  ['averagePrice', /ср\.?\s*цена|средн.*цена|avg.*price|цена|price/i],
  // After averagePrice: "Ср.цена (% от номинала)" is still the price column
  ['faceValue', /номинал|face/i],
  ['currency', /валют|currency|ccy/i],
  ['lastPaymentAmount', /посл\.?\s*выплат|last.*payment|дивиденд|купон|выплата|payment/i],
  ['frequencyPerYear', /частот|frequency|freq|раз.*год/i],
];

function mapHeaders(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  for (let i = 0; i < headers.length; i++) {
    for (const [field, pattern] of HEADER_PATTERNS) {
      if (pattern.test(headers[i]) && map[field] === undefined) {
        map[field] = i;
        break;
      }
    }
  }
  return map;
}

/** Placeholders an AI puts into empty cells. */
const EMPTY_CELL = /^(?:[-–—]+|н\/?д|нет|n\/?a|none|null)$/i;

function cellText(cell: string | undefined): string | undefined {
  // Strip Markdown emphasis/code marks the AI may add: **SBER**, `RU0009029540`
  const text = cell?.replace(/[*`]/g, '').trim();
  if (!text || EMPTY_CELL.test(text)) return undefined;
  return text;
}

/**
 * Number from a report cell: "1 234,56", "1,234.56", "98,5%", "250 ₽", "10 шт".
 * Returns undefined for empty, zero or negative values.
 */
export function parseNumber(s: string | undefined): number | undefined {
  const text = cellText(s);
  if (!text) return undefined;
  let cleaned = text.replace(/[^\d.,-]/g, '');
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // Both separators: the last one is the decimal point
    cleaned = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // "1,234,567" — thousands; "298,60" — decimal comma
    cleaned = (cleaned.match(/,/g)!.length > 1) ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else if (lastDot >= 0 && cleaned.match(/\./g)!.length > 1) {
    cleaned = cleaned.replace(/\./g, '');
  }
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return isNaN(num) || num <= 0 ? undefined : num;
}

function cellsToRow(cells: string[], colMap: ColumnMap): ImportAssetRow | null {
  const cell = (i: number | undefined) => (i !== undefined ? cellText(cells[i]) : undefined);
  const num = (i: number | undefined) => (i !== undefined ? parseNumber(cells[i]) : undefined);

  const name = cell(colMap.name);
  if (!name) return null;

  const quantity = num(colMap.quantity);
  if (!quantity) return null;

  const typeLabel = cell(colMap.type);
  const row: ImportAssetRow = {
    ticker: cell(colMap.ticker)?.toUpperCase(),
    isin: cell(colMap.isin)?.toUpperCase(),
    name,
    type: typeLabel ? parseTypeLabel(typeLabel) : 'Прочее',
    quantity,
    averagePrice: num(colMap.averagePrice),
    currency: cell(colMap.currency)?.toUpperCase(),
    lastPaymentAmount: num(colMap.lastPaymentAmount),
    frequencyPerYear: num(colMap.frequencyPerYear),
  };
  const faceValue = num(colMap.faceValue);
  if (faceValue !== undefined) row.faceValue = faceValue;
  const account = cell(colMap.account);
  if (account) row.account = account;
  return row;
}

function splitTableRow(line: string): string[] {
  const cells = line.split('|').map((c) => c.trim());
  if (cells[0] === '') cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells;
}

function isSeparatorLine(line: string): boolean {
  return /^\s*\|?\s*[-:\s|]+\s*\|?\s*$/.test(line);
}

/** A table row that is a header (named columns), not a position. */
function isHeaderRow(cells: string[]): boolean {
  const map = mapHeaders(cells);
  return map.name !== undefined && map.quantity !== undefined;
}

/** Account name written above a table: "Счёт: ИИС Т-Банк", "### **Счёт — Брокерский**". */
function accountHeadingOf(line: string): string | undefined {
  const match = line.match(/^[\s#>*_]*сч[её]т\s*[:—–-]\s*(.+?)[\s*_]*$/iu);
  return match?.[1].trim() || undefined;
}

/**
 * Parses Markdown tables from the text. Every header row starts a new table, so
 * several tables (one per account, each under a «Счёт: …» line) are all read;
 * rows without a «Счёт» cell take the heading of their table.
 */
export function parseMDTable(text: string): ImportAssetRow[] {
  const rows: ImportAssetRow[] = [];
  let colMap: ColumnMap | undefined;
  let heading: string | undefined;
  let tableAccount: string | undefined;

  for (const line of text.split('\n')) {
    if (!line.includes('|')) {
      heading = accountHeadingOf(line) ?? heading;
      continue;
    }
    if (isSeparatorLine(line)) continue;
    const cells = splitTableRow(line);
    if (isHeaderRow(cells)) {
      colMap = mapHeaders(cells);
      tableAccount = heading;
      heading = undefined;
      continue;
    }
    if (!colMap) continue;
    const row = cellsToRow(cells, colMap);
    if (!row) continue;
    if (!row.account && tableAccount) row.account = tableAccount;
    rows.push(row);
  }
  return rows;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Brings imported rows to the data model before diffing:
 * - bond price in % of face value (as brokers report it) → price per bond in money,
 *   like the Sber parser and MOEX sync store it; without a face value the % price
 *   is dropped rather than stored as rubles;
 * - the same security listed twice in one account (report sections/lots) → one row,
 *   quantities summed, average price weighted by quantity.
 */
export function prepareImportRows(rows: ImportAssetRow[]): ImportAssetRow[] {
  const merged = new Map<string, ImportAssetRow>();
  const result: ImportAssetRow[] = [];

  for (const source of rows) {
    const row = { ...source };
    if (row.type === 'Облигации' && row.averagePrice !== undefined) {
      row.averagePrice = row.faceValue ? round2(row.faceValue * row.averagePrice / 100) : undefined;
    }

    // Same security in different accounts stays separate
    const key = `${row.account?.trim().toUpperCase() ?? ''}|${(row.isin || row.ticker || row.name).toUpperCase()}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      result.push(row);
      continue;
    }
    const quantity = prev.quantity + row.quantity;
    if (prev.averagePrice !== undefined && row.averagePrice !== undefined) {
      prev.averagePrice = round2((prev.averagePrice * prev.quantity + row.averagePrice * row.quantity) / quantity);
    } else {
      prev.averagePrice ??= row.averagePrice;
    }
    prev.quantity = quantity;
    prev.ticker ??= row.ticker;
    prev.isin ??= row.isin;
    prev.faceValue ??= row.faceValue;
    prev.currency ??= row.currency;
    prev.currentPrice ??= row.currentPrice;
  }
  return result;
}

function splitCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseCSV(text: string): ImportAssetRow[] {
  const lines = text.trim().split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]);
  const colMap = mapHeaders(headers);
  if (colMap.name === undefined) return [];

  const rows: ImportAssetRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const row = cellsToRow(cells, colMap);
    if (row) rows.push(row);
  }
  return rows;
}
