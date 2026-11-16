/**
 * Every kind of piece a dungeon may hold: structure that fixes no room's purpose (a dais, statues
 * and busts, a fountain, a well, a fireplace built into a wall, a fire pit) and what nature made in
 * a cave. Ids are stored in models and exports and never translated or renamed; names are
 * `t('dungeonProp.name.<propKey>')`. Listed in the order a room's note names them.
 */

import { idKey } from '../idKey';

export const PROP_KINDS = [
  'dais',
  'statue',
  'bust',
  'fountain',
  'well',
  'hearth',
  'campfire',
  'stalagmites',
  'column-formation',
  'flowstone',
  'curtain',
  'crystals',
  'mushrooms',
  'boulder',
] as const;

export type PropKind = (typeof PROP_KINDS)[number];

export const ALL_PROP_KINDS: ReadonlySet<PropKind> = new Set(PROP_KINDS);

/** The i18n key segment of a kind (`column-formation` → `columnFormation`). */
export function propKey(kind: PropKind): string {
  return idKey(kind);
}
