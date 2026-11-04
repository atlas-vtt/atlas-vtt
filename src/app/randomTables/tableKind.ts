import { roleProperties } from '../loot/lootItem';
import type { RandomTableKind } from '../types/randomTableTypes';

/** What a table most likely gives: items where a column names a price or a rarity, else text. */
export function guessTableKind(columns: readonly string[]): RandomTableKind {
  const roles = roleProperties(columns.map((column) => column.trim()));
  return roles.price !== undefined || roles.rarity !== undefined ? 'items' : 'text';
}
