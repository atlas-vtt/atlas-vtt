import type { FamilyGlyphs } from '../propShapes';
import { STONE_AND_WATER } from '../propStone';
import { GLYPHS as DRESSING } from './dressing';
import { GLYPHS as FORMATIONS } from './formations';
import { GLYPHS as HEARTH } from './hearth';
import { GLYPHS as LIVED_IN } from './livedIn';

/**
 * Every drawn kind of piece: the first props that stay (`propStone.ts`) and each family's module
 * (`props/<family>/index.ts`), which one drawer owns at a time.
 */
export const PROP_GLYPHS: FamilyGlyphs = {
  ...STONE_AND_WATER,
  ...HEARTH,
  ...DRESSING,
  ...FORMATIONS,
  ...LIVED_IN,
};
