/**
 * How a dungeon is drawn. Stroke widths are in pixels at 30 px per cell (the reference scale) and
 * scale with the cell size; distances are in cells. Colours are `#rrggbb`. Nothing is written on
 * a map, so a style has no fonts. The GM never edits one: they pick a whole look from
 * `DUNGEON_STYLES` (`styleCatalog.ts`), and only its id is stored.
 */

/**
 * The three ways a look draws its floors, walls, props and terrain. Stone & shadow paints the plan as
 * built: a course of dressed wall blocks, flagstones and one light casting every shadow. Engraved
 * cuts it as a copperplate: burin lines whose width carries the tone, in two colours. Crayon draws
 * Engraved's lines in graphite on vellum and colours them in with wax crayon, as the Reprieve map of
 * the Lockwood Manor collection is drawn. The rock round the walls is the look's own
 * (`DungeonSurround`) in each.
 */
export type ArtDirection = 'stone' | 'engraved' | 'crayon';

/** The two drawings a piece has (`PropGlyph`): Crayon draws Engraved's, in its own hand. */
export type GlyphPainter = 'stone' | 'engraved';

export function glyphPainterOf(direction: ArtDirection): GlyphPainter {
  return direction === 'stone' ? 'stone' : 'engraved';
}

/**
 * How the floor is laid: irregular flagstones on the cell lines, long ashlar courses, rounded
 * cobbles, or one square slab a cell.
 */
export type FloorPattern = 'flagstone' | 'ashlar' | 'cobble' | 'slab';

/**
 * How the rock round the walls is drawn: clusters of short hatched strokes, one course of blocks,
 * rings of brick courses, stippling that thins out, or only the band's colour.
 */
export type RockMode = 'hatching' | 'stonework' | 'bricks' | 'dots' | 'none';

/** The rock round the walls. */
export interface DungeonSurround {
  mode: RockMode;
  /** How far the rock reaches past the walls, in cells. */
  reach: number;
  /** Strokes per hatching cluster, or courses of bricks plus one. */
  strokes: number;
  /** A hatching cluster's, block's or brick's size, in cells; for dots, how dense they lie. */
  size: number;
  /** The rock's stroke width, in reference pixels. */
  stroke: number;
}

export interface DungeonStyle {
  direction: ArtDirection;
  /** `rock` fills the band of rock round the walls. */
  colors: { ink: string; rock: string; water: string; floor: string; paper: string };
  /** `thick` is the wall's ink outside the floor: the scene's walls lie on its middle. */
  strokes: { thin: number; normal: number; thick: number };
  /** Multiplied onto the floor, so it darkens whatever the floor's colour; white is no shadow. */
  shadow: { color: string; strength: number };
  surround: DungeonSurround;
  floor: FloorPattern;
  /** What grows or settles at the foot of the walls and in the floor's damp hollows: moss, frost, soot, slime. */
  weathering?: { color: string; amount: number };
  /** The grid's line width as a share of the usual, and how strongly its ink shows over the floor (0..1). */
  grid: { weight: number; strength: number };
  /** How the look draws a Forest's entry floor, its mood with it; unset, the generic summer woods (`forestLookOf`). */
  forest?: ForestLook;
}

/**
 * How a look draws a Forest's entry floor: the woods round the clearings (the look's paper as
 * vellum in this colour), the canopy, which trees grow, the clearings' ground, the roads and the
 * water. Each look a forest of its own mood: a dark wood by lantern light, a burnt one in Ember, a
 * snowbound one in Rime, autumn in Ochre and Oxblood.
 */
export interface ForestLook {
  woods: string;
  /** The canopy from the lit edge of the trees to their depth. */
  canopy: { lit: string; mid: string; deep: string };
  /** The shares of the trees that are conifers, and that stand bare (leafless or dead). */
  conifers: number;
  bare: number;
  /** Bare branches, snags and trunks. */
  bark: string;
  /** The clearings' ground, and the grass in patches over it. */
  ground: string;
  grass: string;
  /** Roads and trails worn into the ground. */
  path: string;
  /** Rivers, lakes and pools. */
  water: string;
}

export type GridStyle = 'off' | 'dotted' | 'dashed' | 'solid' | 'broken';
export const GRID_STYLES: readonly GridStyle[] = ['off', 'dotted', 'dashed', 'solid', 'broken'];

/** What is shown, beside the style. */
export interface DungeonView {
  grid: GridStyle;
  /** Grid at half a cell. */
  smallTiles: boolean;
  water: boolean;
  props: boolean;
  /** Always on for the GM (no switch); off only where tests draw a layer alone. */
  shadow: boolean;
  /** Always on for the GM: the Secrets tag decides whether there are secret rooms. */
  secrets: boolean;
  /** Only the style's ink and paper (Stone & shadow: tones between the two). */
  monochrome: boolean;
}

/** Pixels per cell all stroke widths are given for. */
export const REFERENCE_CELL_PX = 30;

export const DEFAULT_VIEW: DungeonView = {
  grid: 'dotted',
  smallTiles: false,
  water: true,
  props: true,
  shadow: true,
  secrets: true,
  monochrome: false,
};
