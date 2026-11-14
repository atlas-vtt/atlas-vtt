/**
 * An aura: a kept circle that follows a token (`KeptMeasure.follows`). It reaches `KeptMeasure.aura`
 * game units from the edge of the token's space, as the map counts distances: where tokens stand on
 * cells it is the token's cells grown by that many cells under the map's diagonal rule (a square
 * under equidistant diagonals, a stepped circle under Euclidean ones, a ring of hexes), and where
 * they stand anywhere the circle that far from the token's edge. Its place is worked out from the
 * token whenever it is drawn; nothing is written when the token moves.
 */

import type { MeasurementSettings } from '../grid/measurementFormat';
import { axialKey } from '../grid/hexLattice';
import type { Point } from '../types/visionTypes';
import type { MeasureAudience } from '../vision/measureOrigin';
import { shapeOnMap, sameAreaMap, type AreaMap, type AreaOnMap } from './areaOnMap';
import { isAura } from './keptMeasures';
import { ringBounds, shapedArea, type ShapedArea } from './measureGeometry';
import { cellKeyAt, hexLayoutOf, lengthInCells } from './measureGrid';
import { cellsStoodOn, placementGridOf } from './measureTokens';
import { MAX_AURA, type KeptAura, type KeptMeasure } from './measureTypes';
import { outlinePointAt, rangeOutline, type RangeOutline } from './rangeOutline';
import { steppedReach } from './reachSteps';
import { countsCells, spaceRadius, type TokenGrid } from './tokenDistance';

/** What an aura reads of its token: where it stands and how large it is. */
export interface AuraToken {
  readonly x: number;
  readonly y: number;
  readonly size?: number | undefined;
}

/** What of a map's rules an aura is measured by. */
export type AuraRules = Pick<MeasurementSettings, 'unitDistance' | 'diagonalRule'>;

/** The least an aura reaches where it is sized freely, in cells; on cells it reaches one at least. */
const LEAST_FREE_REACH = 0.5;
/** Where the first badge on a token's rim stands: lower left, clear of the token's own controls and marks. */
const BADGE_DIRECTION: Point = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
/** How far along the rim each further badge of one token stands from the one before, as an angle: ten go around it. */
const BADGE_STEP = Math.PI / 5;
/** Where the far handle of an aura stands that was given no direction: to its token's right. */
const RIGHT: Point = { x: 1, y: 0 };
const UP = -Math.PI / 2;
/** A circle has no cone and no width. */
const NO_RULES = { coneAngle: 360, coneEnd: 'round', lineWidth: 0 } as const;
/** The outline of a reach that is none: no shape comes of it. */
const NO_OUTLINE: RangeOutline = { kind: 'circle', centre: { x: 0, y: 0 }, radius: 0 };

/** An aura's reach in cells of a map on which one cell spans `unitDistance` game units. */
export function auraCells(aura: number, unitDistance: number): number {
  return unitDistance > 0 && Number.isFinite(unitDistance) ? lengthInCells(aura, unitDistance) : aura;
}

/** What an aura of `cells` cells holds as its reach: game units to the thousandth, within `MAX_AURA`; 0 for no reach. */
export function auraOfCells(cells: number, unitDistance: number): number {
  const units = cells * (unitDistance > 0 && Number.isFinite(unitDistance) ? unitDistance : 1);
  return units > 0 ? Math.min(MAX_AURA, Math.round(units * 1000) / 1000) : 0;
}

/**
 * An aura's reach after `steps` steps up or down, as the map steps a reach (`steppedReach`: a
 * cell's distance, or the next range band): what the token menu's + and − do. Never below none,
 * to the thousandth, within `MAX_AURA`.
 */
export function steppedAura(aura: number, steps: number, settings: Pick<MeasurementSettings, 'mode' | 'rangeBands' | 'unitDistance'>): number {
  const cells = steppedReach(auraCells(aura, settings.unitDistance), steps, settings);
  return Math.min(MAX_AURA, Math.max(0, Math.round(auraOfCells(cells, settings.unitDistance) * 1000) / 1000));
}

/**
 * Where a badge on `token` stands: on the rim of the token's space. An aura's, and that of any
 * kept measurement that starts on the token (`rimSpots`); the `place`-th of several on one token
 * stands that many steps along the rim, so they lie beside each other.
 */
export function auraBadgePoint(token: AuraToken, grid: Pick<TokenGrid, 'size'>, place = 0): Point {
  const rim = spaceRadius(token, grid);
  const cos = Math.cos(place * BADGE_STEP);
  const sin = Math.sin(place * BADGE_STEP);
  return { x: token.x + (BADGE_DIRECTION.x * cos - BADGE_DIRECTION.y * sin) * rim, y: token.y + (BADGE_DIRECTION.x * sin + BADGE_DIRECTION.y * cos) * rim };
}

/** The way an aura's far handle lies from its token, one pixel long: the way its two points lie, and to the right where they say none. */
export function auraDirection({ points }: Pick<KeptMeasure, 'points'>): Point {
  const [from, to] = points;
  const x = (to?.x ?? 0) - (from?.x ?? 0);
  const y = (to?.y ?? 0) - (from?.y ?? 0);
  const length = Math.hypot(x, y);
  return length > 0 && Number.isFinite(length) ? { x: x / length, y: y / length } : RIGHT;
}

/**
 * The two points an aura holds, for whoever reads it without knowing auras: its token's centre and
 * the point `cells` cells past the edge of the token's space, the way `direction` lies. Written
 * whenever the aura itself is edited; a token that moves leaves them where they are.
 */
export function auraPoints(token: AuraToken, cells: number, grid: Pick<TokenGrid, 'size'>, direction: Point = RIGHT): [Point, Point] {
  const radius = spaceRadius(token, grid) + cells * grid.size;
  return [{ x: token.x, y: token.y }, { x: token.x + direction.x * radius, y: token.y + direction.y * radius }];
}

/** A reach as an aura takes it: whole cells and one at least where the map counts cells, and to the tenth of a cell where it does not or `free` says so. */
function fitted(cells: number, grid: TokenGrid, free: boolean): number {
  if (free || !countsCells(grid)) return Math.max(LEAST_FREE_REACH, Math.round(cells * 10) / 10);
  return Math.max(1, Math.round(cells));
}

/**
 * How far an aura of `cells` cells reaches once its far handle was dragged `by` (world pixels):
 * what the drag adds along `direction`, the way the handle lies from the token, so the handle
 * follows the pointer from wherever it was grabbed.
 */
export function auraCellsDragged(cells: number, by: Point, direction: Point, grid: TokenGrid, free = false): number {
  return fitted(cells + (by.x * direction.x + by.y * direction.y) / grid.size, grid, free);
}

/** How far a circle around `token` reaches past the edge of the token's space, in cells, as the aura it becomes. */
export function auraCellsOfCircle(points: readonly Point[], token: AuraToken, grid: TokenGrid): number {
  const [centre, end] = points;
  const radius = centre && end ? Math.hypot(end.x - centre.x, end.y - centre.y) : 0;
  return fitted((radius - spaceRadius(token, grid)) / grid.size, grid, false);
}

/** An aura as it lies around its token now. */
export interface PlacedAura {
  /** The aura placed: another object once it was edited. */
  readonly measure: KeptAura;
  readonly token: AuraToken;
  /** Its reach in cells. */
  readonly cells: number;
  /** Its shape before walls cut it: the same object for as long as the token stands on the same cells. */
  readonly shaped: ShapedArea;
  /** Where its badge stands: on the rim of its token's space. */
  readonly handle: Point;
  /** Where its far handle stands: on its outline, the way its points lie. */
  readonly end: Point;
  /** The top of its outline, which its label stands above. */
  readonly top: Point;
  /** What its shape was made from. */
  readonly made: string;
}

/** The shape of the cells within reach: a point is in it when its cell is. */
function cellsShape(outline: RangeOutline & { kind: 'cells' }, grid: TokenGrid, towards: Point): ShapedArea {
  const hex = hexLayoutOf(grid) !== null;
  const keys = new Set(outline.cells.map(([a, b]) => (hex ? axialKey({ q: a, r: b }) : `${a},${b}`)));
  const bounds = ringBounds(outline.loops);
  const origin = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  let reach = 0;
  for (const loop of outline.loops) {
    for (const corner of loop) reach = Math.max(reach, Math.hypot(corner.x - origin.x, corner.y - origin.y));
  }
  return { origin, towards, reach, rings: outline.loops, bounds, contains: (point) => keys.has(cellKeyAt(grid, point)) };
}

/** An aura's shape, with the points of its outline that its far handle and its label stand at. */
function shapeOf(outline: RangeOutline, grid: TokenGrid, towards: Point): Pick<PlacedAura, 'shaped' | 'end' | 'top'> | null {
  const { centre } = outline;
  const shaped = outline.kind === 'cells'
    ? cellsShape(outline, grid, towards)
    : shapedArea({ shape: 'circle', points: [centre, { x: centre.x + towards.x * outline.radius, y: centre.y + towards.y * outline.radius }] }, NO_RULES);
  if (!shaped) return null;
  // Asked from the shape's own middle: a token placed freely stands off the middle of its cells.
  const around: RangeOutline = { ...outline, centre: shaped.origin };
  return { shaped, end: outlinePointAt(around, Math.atan2(towards.y, towards.x)), top: outlinePointAt(around, UP) };
}

/** What decides an aura's shape: the cells its token stands on (its place, where it stands anywhere), its reach, the grid and the rule. */
function madeFrom(token: AuraToken, cells: number, grid: TokenGrid, rules: AuraRules, towards: Point): string {
  const place = countsCells(grid)
    ? cellsStoodOn(token, token.size || 1, placementGridOf(grid)).map(({ x, y }) => `${Math.round(x * 8)},${Math.round(y * 8)}`).join(';')
    : `${token.x},${token.y},${token.size ?? 1}`;
  return [grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0, grid.snapToGrid !== false, rules.diagonalRule, cells, towards.x, towards.y, place].join('|');
}

/**
 * `measure` around `token` on `grid`. `before` is how it was placed last: the same object comes
 * back while nothing it is made from changed, and its shape stays the same object while the token
 * stands on the same cells, so a token dragged within its cells has its aura worked out once. Null
 * where the token stands at no place or the aura has no shape there.
 */
export function placeAura(measure: KeptAura, token: AuraToken, grid: TokenGrid, rules: AuraRules, before: PlacedAura | null = null): PlacedAura | null {
  if (!Number.isFinite(token.x) || !Number.isFinite(token.y) || !(grid.size > 0)) return null;
  const cells = auraCells(measure.aura, rules.unitDistance);
  const towards = auraDirection(measure);
  const made = madeFrom(token, cells, grid, rules, towards);
  const same = before !== null && before.made === made;
  if (same && before.measure === measure && before.token.x === token.x && before.token.y === token.y && before.token.size === token.size) return before;
  const shape = same ? before : shapeOf(rangeOutline({ x: token.x, y: token.y, size: token.size || 1 }, cells, grid, rules.diagonalRule) ?? NO_OUTLINE, grid, towards);
  if (!shape) return null;
  return {
    measure,
    token: { x: token.x, y: token.y, size: token.size },
    cells,
    shaped: shape.shaped,
    handle: auraBadgePoint(token, grid),
    end: shape.end,
    top: shape.top,
    made,
  };
}

/** What was asked for last, and what came of it. */
interface Asked {
  readonly shaped: ShapedArea;
  readonly map: AreaMap;
  readonly stops: boolean;
  readonly value: AreaOnMap;
}

/** A placed aura as it lies on a map (`shapeOnMap`), worked out again only for another shape, map or choice about walls. */
export class AuraOnMapMemo {
  private last: Asked | null = null;

  get(placed: PlacedAura, map: AreaMap, stopsAtWalls = true): AreaOnMap {
    const { last } = this;
    if (last && last.shaped === placed.shaped && last.stops === stopsAtWalls && sameAreaMap(last.map, map)) return last.value;
    const value = shapeOnMap(placed.shaped, map, stopsAtWalls);
    this.last = { shaped: placed.shaped, map, stops: stopsAtWalls, value };
    return value;
  }

  forget(): void {
    this.last = null;
  }
}

/**
 * Who sees a kept measurement. An aura is seen with its token: the players' picture shows it while
 * they see the token it follows, and never the aura of a hidden one. Any other measurement says it
 * itself (`hidden`, and the tokens it started on).
 */
export function keptAudience(measure: KeptMeasure): MeasureAudience {
  if (!isAura(measure)) return measure;
  return { hidden: measure.hidden, origin: { tokenIds: [measure.follows], unseenAtStart: false } };
}
