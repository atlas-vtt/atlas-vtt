import type { FamilyGlyphs, PropGlyph } from '../../propShapes';
import * as stone from './stone';
import * as engraved from './engraved';
import { HEARTH, partPath } from './shapes';
import { stackFireplace, stackFireplaceSilhouette } from './stackFireplace';

const HEARTH_GLYPH: Omit<PropGlyph, 'stone' | 'engraved'> = { material: 'dressed', radius: 0.9, lift: 0.7, silhouette: partPath(HEARTH) };
const STACK_GLYPH: Omit<PropGlyph, 'stone' | 'engraved'> = { material: 'dressed', radius: 0.7, lift: 0.35, silhouette: stackFireplaceSilhouette };

/** Each glyph receives its base material's final grain pass over the shared silhouette; a lit one shares its cold one's. */
export const GLYPHS: FamilyGlyphs = {
  hearth: {
    ...HEARTH_GLYPH,
    stone: stone.hearth,
    engraved: engraved.hearth,
    lit: { ...HEARTH_GLYPH, stone: stone.litHearth, engraved: engraved.litHearth },
    inHouse: {
      ...STACK_GLYPH,
      stone: pen => stackFireplace(pen, true),
      engraved: pen => stackFireplace(pen, false),
      lit: { ...STACK_GLYPH, stone: pen => stackFireplace(pen, true, true), engraved: pen => stackFireplace(pen, false, true) },
    },
  },
};
