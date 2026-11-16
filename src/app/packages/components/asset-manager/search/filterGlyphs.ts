import { Shapes, Tag, type LucideIcon } from 'lucide-react';

/**
 * The glyph of a filter whose values could be read as another's: a tag "Beast" and the creature type "Beast" share a
 * word, so the tag keeps the sidebar's tag glyph and the type has its own, in the filter panel and on the active chips.
 * Keyed by the filter's id (`CreatureFilterDefinition.id`, `'tags'` for the tag filter); null for every other filter.
 */
export function filterGlyph(filterId: string): LucideIcon | null {
  if (filterId === 'type') return Shapes;
  if (filterId === 'tags') return Tag;
  return null;
}
