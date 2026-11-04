import { IGNORED_FIELDS } from '../../creatures/ignoredFields';
import type { FieldKey } from './templateTypes';

/** Keys a template field may never bind: markers, Obsidian's own properties and Fantasy Statblocks' keys. */
const STATBLOCK_RESERVED: ReadonlySet<string> = new Set([
  'statblock', 'atlas-template', 'layout', 'tags', 'aliases', 'cssclasses', 'cssclass',
]);

/** `name` and `image` are fields of their own, though readers outside the template treat them specially. */
const ALLOWED_DESPITE_IGNORED: ReadonlySet<string> = new Set(['name', 'image']);

export function isReservedKey(key: FieldKey): boolean {
  if (ALLOWED_DESPITE_IGNORED.has(key)) return false;
  return STATBLOCK_RESERVED.has(key) || IGNORED_FIELDS.has(key);
}
