import type { FamilyGlyphs, PropGlyph } from '../../propShapes';
import { campfire, campfireSilhouette } from './campfire';

const CAMPFIRE: Omit<PropGlyph, 'stone' | 'engraved'> = { material: 'rock', radius: 0.42, lift: 0.1, silhouette: campfireSilhouette };

/**
 * What those who live in caves leave: a fire ring of stones round its ash, burning while they are
 * there. One drawing, which asks its painter how to finish every part: Stone fills and textures
 * it, Engraved leaves it paper and cuts its material and shade in lines.
 */
export const GLYPHS: FamilyGlyphs = {
  campfire: {
    ...CAMPFIRE,
    stone: pen => campfire(pen),
    engraved: pen => campfire(pen),
    lit: { ...CAMPFIRE, stone: pen => campfire(pen, true), engraved: pen => campfire(pen, true) },
  },
};
