import { valueNoise } from '../art/noise';
import type { Field, PathFn } from '../art/paths';
import type { Bounds } from '../geometry';
import { CRAYONS } from './colours';
import type { CrayonBox } from './crayonBox';

/**
 * Ground coloured in as the forest's clearings are: never one even coat (a large area coloured all
 * over shows the hand's lines as bands), but a light coat that comes and goes in broad patches, a
 * second colour thicker in spots and a third where the ground is worn, the paper showing through
 * all of them so tokens stand out. Each ground is a recipe of such coats; the fields belong to the
 * map, not to the area, so neighbouring areas of one ground meet without a seam.
 */

/** Where a coat lies heavier: in broad patches, in spots, or where the ground is worn. */
export type GroundPattern = 'broad' | 'spots' | 'worn';

/** One coat of a ground: its crayon, how much the hand leaves, in how many passes, and where. */
export interface GroundCoat {
  colour: string;
  cover: number;
  passes: number;
  pattern: GroundPattern;
}

/** A ground's coats, laid in order. */
export type CrayonGround = readonly GroundCoat[];

/** Dolmenwood's meadow, the light yellow-green of open ground. */
const MEADOW = '#a8a348';
/** Grass growing thicker in spots. */
const GRASS = '#7f9a4a';
/** Damp and soot on stone: the grey-green of the slate crayon, lighter. */
const STAIN = '#7f8576';
/** A cave's floor: the grey-brown of bare rock. */
const CAVE_ROCK = '#a39478';
/** Floorboards: the wood crayon, a little paler for the boards' sawn faces. */
const BOARDS = '#c08f4f';

/** The ground of every coloured-in floor and lawn, by what it is. */
export const CRAYON_GROUNDS = {
  /** A forest's clearing, a house's lawn: meadow in broad patches, grass in spots, earth where worn. */
  meadow: [
    { colour: MEADOW, cover: 0.38, passes: 2, pattern: 'broad' },
    { colour: GRASS, cover: 0.32, passes: 2, pattern: 'spots' },
    { colour: CRAYONS.earth, cover: 0.25, passes: 1, pattern: 'worn' },
  ],
  /** Flagstones and dressed floors: grey stone, stained in spots, earth-brown where feet wear it. */
  stone: [
    { colour: CRAYONS.stone, cover: 0.34, passes: 2, pattern: 'broad' },
    { colour: STAIN, cover: 0.2, passes: 2, pattern: 'spots' },
    { colour: CRAYONS.earth, cover: 0.2, passes: 1, pattern: 'worn' },
  ],
  /** Packed earth (a stable's, a fortress's yard): earth crayon, darker in spots. */
  earth: [
    { colour: CRAYONS.earth, cover: 0.42, passes: 2, pattern: 'broad' },
    { colour: CRAYONS.straw, cover: 0.24, passes: 1, pattern: 'spots' },
    { colour: CRAYONS.earth, cover: 0.24, passes: 1, pattern: 'worn' },
  ],
  /** A cave's floor: bare rock in broad patches, slate in spots, earth where it is trodden. */
  cave: [
    { colour: CAVE_ROCK, cover: 0.36, passes: 2, pattern: 'broad' },
    { colour: CRAYONS.slate, cover: 0.18, passes: 2, pattern: 'spots' },
    { colour: CRAYONS.earth, cover: 0.2, passes: 1, pattern: 'worn' },
  ],
  /** Floorboards: wood along the grain in broad patches, darker where worn. */
  boards: [
    { colour: BOARDS, cover: 0.4, passes: 2, pattern: 'broad' },
    { colour: CRAYONS.wood, cover: 0.22, passes: 1, pattern: 'worn' },
  ],
} as const satisfies Record<string, CrayonGround>;

export type CrayonGroundId = keyof typeof CRAYON_GROUNDS;

/** The map's patterns, from its seed: the same at every place whatever area asks. */
export function groundFields(seed: number): Record<GroundPattern, Field> {
  const broad = (x: number, y: number): number => valueNoise(x * 0.18, y * 0.18, seed + 61) * 0.7 + valueNoise(x * 0.5, y * 0.5, seed + 62) * 0.3;
  return {
    broad: (x, y) => 0.5 + 0.5 * broad(x, y),
    spots: (x, y) => Math.max(0, (valueNoise(x * 1.1, y * 1.1, seed + 63) - 0.55) * 3.2),
    worn: (x, y) => Math.max(0, 1 - broad(x, y) * 2.5),
  };
}

/** The patterns thinning away with `fade` (0..1), as a ground that fades into the paper. */
export function fadedFields(fields: Record<GroundPattern, Field>, fade: Field): Record<GroundPattern, Field> {
  return {
    broad: (x, y) => fields.broad(x, y) * fade(x, y),
    spots: (x, y) => fields.spots(x, y) * fade(x, y),
    worn: (x, y) => fields.worn(x, y) * fade(x, y),
  };
}

/**
 * Colours `path` in as `ground`. Every coat is hatched over `bounds` (the drawing's window, so an
 * area's strokes run on across its neighbours') through the same path, whose mask is made once;
 * along `angle` (radians) where the ground has a grain.
 */
export function colourGround(box: CrayonBox, path: PathFn, ground: CrayonGround, fields: Record<GroundPattern, Field>, bounds: Bounds, angle?: number): void {
  for (const coat of ground) box.colourIn(path, { colour: coat.colour, cover: coat.cover, passes: coat.passes, ...(angle !== undefined && { angle }) }, fields[coat.pattern], bounds);
}
