import type { FamilyGlyphs } from '../../propShapes';
import * as stone from './stone';
import * as engraved from './engraved';
import { PLINTH, panelPath } from './shapes';

/** This family's drawings, one entry per kind of `kinds.ts`, each with a drawing for both painters. */
export const GLYPHS: FamilyGlyphs = {
  bust: { material: 'dressed', radius: 0.18, lift: 0.7, silhouette: panelPath(PLINTH), stone: stone.bust, engraved: engraved.bust },
};
