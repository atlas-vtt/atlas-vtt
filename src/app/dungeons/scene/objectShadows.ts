import type { WallSegment } from '../../types/wallTypes';
import type { DungeonProp, DungeonTerrain, TerrainKind } from '../model';
import { rotate } from '../render/geometry';
import { propTall } from '../render/propShapes';
import { cellBox } from '../render/terrain/cellRings';
import { FRAGMENT, INSET as DRAWN_INSET } from '../render/terrain/footprints';
import { loneTrees } from '../render/forest/loneTrees';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonView } from '../style';
import type { DungeonPlacement } from './toWalls';

/**
 * Tall objects as small closed walls in their scene that block light (the shadows a lamp casts)
 * without walls drawn by the GM: standing columns, statues, wells, and the terrain that is total
 * cover (pillars, statues, wall fragments, obelisks). They never block sight (`blocks: 'light'`):
 * players see the object and past it. Each face blocks light only from inside (`insideOf`): the
 * object's top is lit with its faces, never a black hole in the players' picture, and what stands
 * behind it lies in its shadow. Low ones (a dais,
 * a fountain, a fire pit, low walls) get none. Each outline is one convex
 * polygon of at most eight corners, lies inside what the map draws, and keeps farther than the
 * engine's seal tolerance from every wall and every other outline, so sealing never bridges an
 * object to a wall.
 */

/** Where a tall object stands, in cells: a disc, or a rectangle turned by `rotation`. */
export interface Footprint {
  x: number;
  y: number;
  /** Half its width and height; a disc's radius, both. */
  halfW: number;
  halfH: number;
  round: boolean;
  rotation: number;
}

/**
 * The tall terrain, by how far its drawing keeps inside the cells it fills (`render/terrain/footprints.ts`);
 * a wall fragment is a slab of `FRAGMENT` along its longer side, its broken ends short of the cells.
 */
const TALL_TERRAIN: Partial<Record<TerrainKind, number>> = { pillar: DRAWN_INSET.pillar, obelisk: DRAWN_INSET.obelisk, statue: DRAWN_INSET.statue };

/** The outline's share of the footprint: inside the drawn object's ink. */
const INSET = 0.85;
/** An outline that must shrink below this share of its size to keep clear of walls casts no shadow. */
const SMALLEST = 0.4;
/** The steps an outline shrinks by while it is too close to a wall. */
const SHRINK_STEPS = 12;
/** Pixels an outline keeps beyond the seal tolerance. */
const MARGIN = 1;

/**
 * A tall prop's outline, by the size and place of what the map draws of it (`tall` on its drawing:
 * a statue's plinth, a well's ring, a wardrobe's case at the back of its cell), so it always lies
 * on its drawn object.
 */
export function propFootprint(prop: DungeonProp, tall = propTall(prop.kind)): Footprint | null {
  if (!tall) return null;
  const off = rotate({ x: (tall.x ?? 0) * prop.scale, y: (tall.y ?? 0) * prop.scale }, prop.rotation);
  return { x: prop.x + off.x, y: prop.y + off.y, halfW: tall.halfW * prop.scale, halfH: tall.halfH * prop.scale, round: tall.round, rotation: prop.rotation };
}

function terrainFootprint(piece: DungeonTerrain): Footprint | null {
  const box = cellBox(piece.cells);
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2, rotation: 0, round: false };
  if (piece.kind === 'wall-fragment') {
    const along = Math.max(box.w, box.h) / 2 - FRAGMENT.ends;
    return box.w >= box.h ? { ...centre, halfW: along, halfH: FRAGMENT.half } : { ...centre, halfW: FRAGMENT.half, halfH: along };
  }
  const inset = TALL_TERRAIN[piece.kind];
  return inset === undefined ? null : { ...centre, halfW: box.w / 2 - inset, halfH: box.h / 2 - inset };
}

/** The tall objects of a floor as shown: columns standing on its floor, tall props where props are shown, and tall terrain, in its shown rooms. */
export function tallObjects(dungeon: VisibleDungeon, view: Pick<DungeonView, 'props'>): Footprint[] {
  const { floor, field, roomShapes } = dungeon;
  const columns = floor.columns
    .filter(column => !column.shattered && field.distance(column.x, column.y) < 0)
    .map((column): Footprint => ({ x: column.x, y: column.y, halfW: column.radius, halfH: column.radius, round: !column.square, rotation: 0 }));
  const props = view.props ? floor.props.filter(prop => roomShapes.has(prop.room)).flatMap(prop => propFootprint(prop) ?? []) : [];
  const terrain = floor.terrain.filter(piece => roomShapes.has(piece.room)).flatMap(piece => terrainFootprint(piece) ?? []);
  // A Forest's lone trees stand on their trunks: a narrow one a fifth of a cell across, a thick one a quarter.
  const trunks = loneTrees(dungeon).map((tree): Footprint => {
    const r = tree.thick ? TRUNK.thick : TRUNK.narrow;
    return { x: tree.x, y: tree.y, halfW: r, halfH: r, round: true, rotation: 0 };
  });
  return [...columns, ...props, ...terrain, ...trunks];
}

/** A lone tree's trunk's radius, in cells, by how thick it is (`LoneTree.thick`). */
const TRUNK = { narrow: 0.12, thick: 0.18 } as const;

interface Point {
  x: number;
  y: number;
}

/** Corners of a footprint's outline at `share` of its size, in world px. */
function outlineCorners(footprint: Footprint, share: number, world: (p: Point) => Point): Point[] {
  const { x, y, halfW, halfH, round, rotation } = footprint;
  if (round) {
    // An octagon with flat sides up and down, its corners on the disc of `share` of the radius
    return Array.from({ length: 8 }, (_, k) => {
      const angle = Math.PI / 8 + (k * Math.PI) / 4;
      return world({ x: x + Math.cos(angle) * halfW * share, y: y + Math.sin(angle) * halfH * share });
    });
  }
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const corners: [number, number][] = [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]];
  return corners.map(([u, v]) => world({ x: x + (u * cos - v * sin) * share, y: y + (u * sin + v * cos) * share }));
}

function pointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const along = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(p.x - a.x - abx * along, p.y - a.y - aby * along);
}

function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(pointToSegment(a, c, d), pointToSegment(b, c, d), pointToSegment(c, a, b), pointToSegment(d, a, b));
}

/**
 * The side of the edge `a`→`b` the outline's middle lies on, which the edge blocks light from
 * (`WallSegment.direction`): a lamp outside shines through the near faces onto the object's top
 * and is stopped at the far faces, so the top is lit wherever its faces are while what lies behind
 * stays in its shadow. (The outline is convex, so every face's inside is the middle's side.)
 */
function insideOf(a: Point, b: Point, centre: Point): 'left' | 'right' {
  // The left normal of a→b is (-dy, dx), as `wallNormal` has it.
  return -(b.y - a.y) * (centre.x - a.x) + (b.x - a.x) * (centre.y - a.y) > 0 ? 'left' : 'right';
}

/** The least distance between a closed ring and segments. */
function ringDistance(ring: readonly Point[], segments: readonly (readonly [Point, Point])[]): number {
  let least = Infinity;
  ring.forEach((a, k) => {
    const b = ring[(k + 1) % ring.length]!;
    for (const [c, d] of segments) least = Math.min(least, segmentDistance(a, b, c, d));
  });
  return least;
}

/**
 * Closed outlines of `objects` on a floor whose walls (world px) are `walls`: each the polygon of
 * its footprint at `INSET`, made smaller where that keeps it beyond `tolerance` (the seal tolerance
 * of the scene's map) from every wall and every outline before it, left out where it would shrink
 * below `SMALLEST`. Ids begin with `id`.
 */
export function objectShadows(
  objects: readonly Footprint[],
  walls: readonly WallSegment[],
  placement: DungeonPlacement,
  tolerance: number,
  id: string,
  levels?: string[],
): Record<string, WallSegment> {
  const { originCell, pxPerCell } = placement;
  const world = (p: Point): Point => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  const keep = tolerance + MARGIN;
  const segments: (readonly [Point, Point])[] = walls.map(wall => [wall.p1, wall.p2] as const);
  const out: Record<string, WallSegment> = {};
  let placed = 0;
  for (const footprint of objects) {
    const centre = world(footprint);
    const reach = Math.hypot(footprint.halfW, footprint.halfH) * INSET * pxPerCell + keep;
    // Only what lies within its reach can come near it
    const near = segments.filter(([a, b]) => pointToSegment(centre, a, b) <= reach);
    let corners: Point[] | null = null;
    for (let step = 0; step <= SHRINK_STEPS && !corners; step++) {
      const share = INSET * (1 - ((1 - SMALLEST) * step) / SHRINK_STEPS);
      const ring = outlineCorners(footprint, share, world);
      if (ringDistance(ring, near) > keep) corners = ring;
    }
    if (!corners) continue;
    const ring = corners;
    placed++;
    ring.forEach((p1, k) => {
      const wallId = `${id}_${placed}_${k + 1}`;
      const p2 = ring[(k + 1) % ring.length]!;
      out[wallId] = { id: wallId, kind: 'wall', type: 'solid', blocks: 'light', direction: insideOf(p1, p2, centre), p1, p2, chainId: `${id}_${placed}`, ...(levels && { levels }) };
      segments.push([p1, p2]);
    });
  }
  return out;
}
