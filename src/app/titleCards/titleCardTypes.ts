export type TitleCardLayout = 'list' | 'two' | 'three';

/** A reusable announcement/presentation card kept in the GM's Atlas settings. */
export interface TitleCard {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export function readTitleCards(value: unknown): TitleCard[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TitleCard => {
    if (item === null || typeof item !== 'object') return false;
    const card = item as Partial<TitleCard>;
    return typeof card.id === 'string'
      && card.id.trim().length > 0
      && typeof card.title === 'string'
      && card.title.trim().length > 0
      && typeof card.subtitle === 'string'
      && typeof card.description === 'string'
      && typeof card.createdAt === 'number'
      && Number.isFinite(card.createdAt)
      && typeof card.updatedAt === 'number'
      && Number.isFinite(card.updatedAt);
  });
}

export function readTitleCardLayout(value: unknown): TitleCardLayout {
  return value === 'two' || value === 'three' ? value : 'list';
}
