/**
 * The kinds of pieces and terrain the generator may put on a map: those with a drawing. A kind
 * the catalogue knows but no painter draws yet is never offered, so no map shows a gap or a
 * stand-in. Unit tests hold each set equal to its drawing registry (`drawnPropKinds()` in
 * `render/propShapes.ts`, `drawnTerrainKinds()` in `render/terrain/drawTerrain.ts`); kinds still
 * waiting are listed in `tests/unit/dungeons/awaitingDrawings.json`, which `npm run preflight`
 * holds empty. Pieces are drawn by family: each family's `kinds.ts` lists what it draws, and only
 * those lists are read here, so the generator never loads a drawing.
 */

import type { GroundsKind, TerrainKind } from './model';
import type { PropKind } from './props/propKinds';
import { KINDS as DRESSING } from './render/props/dressing/kinds';
import { KINDS as GROUNDS } from './render/grounds/kinds';
import { KINDS as FORMATIONS } from './render/props/formations/kinds';
import { KINDS as HEARTH } from './render/props/hearth/kinds';
import { KINDS as LIVED_IN } from './render/props/livedIn/kinds';

/** The props of the first generator that stay, drawn in `render/propStone.ts`. */
export const FIRST_PROP_KINDS: readonly PropKind[] = ['dais', 'statue', 'fountain', 'well'];

export const DRAWN_PROP_KINDS: ReadonlySet<PropKind> = new Set<PropKind>([...FIRST_PROP_KINDS, ...HEARTH, ...DRESSING, ...FORMATIONS, ...LIVED_IN]);

export const DRAWN_TERRAIN_KINDS: ReadonlySet<TerrainKind> = new Set<TerrainKind>([
  'guano',
  'bone-litter',
  'sulphur-crust',
  'rimstone',
  'boulder-choke',
  'low-wall',
  'rubble-heap',
  'pillar',
  'statue',
  'wall-fragment',
  'obelisk',
  'rubble-field',
  'broken-floor',
  'shallow-water',
  'brambles',
  'thicket',
  'tangled-roots',
  'chasm-floor',
  'chasm',
  'shaft',
  'channel',
  'deep-water',
  'pit',
  'gallery',
  'murder-hole',
  'bridge',
  'platform',
  'ledge',
  'mosaic',
  'pool',
  'portal-ring',
]);

/** The pieces of a house's grounds with a drawing (`houseModel.ts`, drawn in `render/grounds/`). */
export const DRAWN_GROUNDS_KINDS: ReadonlySet<GroundsKind> = new Set<GroundsKind>(GROUNDS);
