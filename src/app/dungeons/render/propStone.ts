import type { PropKind } from '../model';
import { circlePath, polygonPath, roundedRect, type GlyphPen } from './glyphPen';
import { STONE_ENGRAVED, STONE_STONE, statueFigure } from './propClassicStone';
import { WATER_ENGRAVED, WATER_STONE } from './propClassicWater';
import type { PropGlyph } from './propShapes';

/** The props of stone and water, in the glyph family's grammar (`glyphPen.ts`). */

const FOUNTAIN_R = 0.5;
/** A well's outer radius at scale 1, which its lighting outline (`tall`) keeps to. */
export const WELL_RADIUS = 0.4;
const WELL = { outer: WELL_RADIUS, inner: 0.25 };
/** The side of a statue's plinth at scale 1, which its lighting outline (`tall`) keeps to. */
export const STATUE_PLINTH = 0.6;
const PLINTH = STATUE_PLINTH;

function octagon(r: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    points.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return points;
}

/** What is cut from stone, bevelled, and the water some of it holds. */
export const STONE_AND_WATER = {
  fountain: {
    material: 'stone',
    radius: 0.5,
    dome: true,
    lift: 0.3,
    silhouette: path => polygonPath(path, octagon(FOUNTAIN_R)),
    stone: WATER_STONE.fountain,
    engraved: WATER_ENGRAVED.fountain,
  },
  well: {
    material: 'stone',
    radius: 0.4,
    dome: true,
    tall: { halfW: WELL.outer, halfH: WELL.outer, round: true },
    lift: 0.35,
    silhouette: path => circlePath(path, WELL.outer),
    stone: WATER_STONE.well,
    engraved: WATER_ENGRAVED.well,
  },
  statue: {
    material: 'dressed',
    radius: 0.3,
    tall: { halfW: PLINTH / 2, halfH: PLINTH / 2, round: false },
    lift: 1,
    silhouette: path => roundedRect(path, 0, 0, PLINTH, PLINTH),
    stone: STONE_STONE.statue,
    engraved: STONE_ENGRAVED.statue,
  },
  dais: {
    material: 'dressed',
    radius: 1.4,
    lift: 0.15,
    stone: STONE_STONE.dais,
    engraved: STONE_ENGRAVED.dais,
  },
} satisfies Partial<Record<PropKind, PropGlyph>>;

/** The same overhead carving used on a separate terrain plinth. */
export function drawStatueFigure(pen: GlyphPen): void {
  statueFigure(pen, pen.hand.scene.env.style.direction === 'engraved');
}

const FIGURE = 1.25;

/** The figure alone, for a statue whose plinth is drawn apart from it. */
export const STATUE_FIGURE: PropGlyph = {
  material: 'stone',
  radius: 0.24,
  dome: true,
  lift: 1,
  silhouette: path => circlePath(path, 0.22 * FIGURE, 0, 0.02 * FIGURE),
  stone: pen => statueFigure(pen, false),
  engraved: pen => statueFigure(pen, true),
};
