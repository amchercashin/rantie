export interface Account {
  id?: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Holding {
  id?: number;
  accountId: number;
  assetId: number;
  quantity: number;
  quantitySource: 'import' | 'manual';
  importedQuantity?: number;
  averagePrice?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const KNOWN_TYPE_CONFIG: Record<string, { label: string; color: string; defaultFrequency: number }> = {
  'Акции': { label: 'Акции', color: '#d9c08e', defaultFrequency: 1 },
  'Облигации': { label: 'Облигации', color: '#8fb0c9', defaultFrequency: 2 },
  'Фонды': { label: 'Фонды', color: '#c79a7a', defaultFrequency: 12 },
  'Вклады': { label: 'Вклады', color: '#9dbf8e', defaultFrequency: 12 },
  'Недвижимость': { label: 'Недвижимость', color: '#b59ad1', defaultFrequency: 12 },
  'Крипта': { label: 'Крипта', color: '#e0a458', defaultFrequency: 12 },
  'Валюта': { label: 'Валюта', color: '#7fbfb4', defaultFrequency: 0 },
  'Прочее': { label: 'Прочее', color: '#a39a8c', defaultFrequency: 0 },
};

export function getTypeSuggestions(existingTypes: string[]): string[] {
  const known = Object.keys(KNOWN_TYPE_CONFIG);
  const combined = new Set([...known, ...existingTypes]);
  return Array.from(combined);
}

export function getTypeColor(type: string): string {
  if (KNOWN_TYPE_CONFIG[type]) return KNOWN_TYPE_CONFIG[type].color;
  let hash = 0;
  for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 32%, 66%)`;
}

export function getDefaultFrequency(type: string): number | undefined {
  return KNOWN_TYPE_CONFIG[type]?.defaultFrequency;
}
