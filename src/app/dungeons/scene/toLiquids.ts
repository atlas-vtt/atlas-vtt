import { MAX_AREA_CORNERS } from '../../lighting/lightArea';
import type { LightEmission, LightSource } from '../../types/lightingTypes';
import { MAX_LIQUID_CORNERS } from '../../liquids/liquids';
import type { LiquidKind, LiquidSurface } from '../../types/liquidTypes';
import type { CellPoint, DungeonColumn, DungeonFloor, DungeonTerrain } from '../model';
import { intersectRings, subtractRings, unionRings } from '../render/clipShapes';
import { shapeRings, smoothClosedPoints, type Vec } from '../render/geometry';
import { simplifyRing } from '../render/simplifyRing';
import type { VisibleDungeon } from '../render/visibleDungeon';
import type { DungeonStyle, DungeonView } from '../style';
import { cellsToUnits, type SceneUnit } from './gameUnits';
import { liquidColours } from './liquidColours';
import { isBuiltWater, isNaturalDeepWater, isSubmergedRimstone, naturalDeepRings } from '../render/art/pools';
import { rimstoneShelves } from '../render/terrain/caveStones';
import { propPolygon } from './toFeatures';
import type { DungeonPlacement } from './toWalls';

/**
 * What a floor's water, lava and acid bring to its scene: a surface that moves while maps are
 * animated (`objects.liquids`) on exactly what the map paints of it, and for lava and acid a light
 * that glows from the whole of that surface (`LightSource.area`), so a room with lava is lit by it.
 */

/** How far a simplified outline may stray from the drawn one at first, in cells; doubled until it fits. */
const FIRST_TOLERANCE = 0.01;

interface Liquid {
  liquid: LiquidKind;
  /** Its outline in cells. */
  ring: Vec[];
  /** Islands and what stands in it, in cells. */
  holes?: Vec[][];
  flow?: Vec;
  lavaLight?: string;
}

/** What each hazard on the floor holds, if it is a liquid. */
const HAZARD_LIQUID: Readonly<Partial<Record<string, LiquidKind>>> = { lava: 'lava', acid: 'acid', 'deep-water': 'water' };

/**
 * Where a floor is a traced cave, its liquids keep to the drawn floor, which a cell at the cave's
 * edge reaches past. A cave's deep water is part of the pool it lies in (`poolLiquids`); only where
 * the view hides the pools is it a surface of its own, with the shore the map draws it with.
 */
function terrainLiquids(dungeon: VisibleDungeon, pieces: readonly DungeonTerrain[], floorRings: Vec[][] | null, poolsShown: boolean): Liquid[] {
  return pieces.flatMap(piece => {
    const liquid = piece.traits.hazard && HAZARD_LIQUID[piece.traits.hazard];
    if (!liquid || (piece.kind !== 'channel' && piece.kind !== 'deep-water')) return [];
    const natural = isNaturalDeepWater(dungeon.floor, piece);
    if (natural && poolsShown) return [];
    const flow = piece.kind === 'channel' && piece.facing ? { x: piece.facing.x, y: piece.facing.y } : undefined;
    const rings = natural ? naturalDeepRings(piece.cells, dungeon.model.seed + piece.id) : cellRings(piece.cells);
    return withHoles(floorRings ? intersectRings(rings, floorRings) : rings).map(({ ring, holes }): Liquid => ({ liquid, ring, ...(holes.length && { holes }), ...(flow && { flow }) }));
  });
}

/** The outline of cells as clipping makes it: whole rings with their holes, never a ring per row. */
function cellRings(cells: readonly CellPoint[]): Vec[][] {
  return unionRings(cells.map(({ x, y }) => [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }]));
}

/**
 * Rings within `limit` corners together: as drawn where they fit, else all simplified alike, as
 * little as it takes. A surface may hold `MAX_LIQUID_CORNERS`, an area light `MAX_AREA_CORNERS`:
 * fitting a pool's shore to the light's limit drew it as chords far off the painted shore.
 */
function fitCorners(rings: Vec[][], limit: number): Vec[][] {
  const corners = (fitted: Vec[][]): number => fitted.reduce((sum, ring) => sum + ring.length, 0);
  let fitted = rings;
  for (let tolerance = FIRST_TOLERANCE; corners(fitted) > limit; tolerance *= 2) fitted = rings.map(ring => simplifyRing(ring, tolerance));
  return fitted;
}

/** The outline of a standing column, which the water flows round. */
function columnRing({ x, y, radius, square }: DungeonColumn): Vec[] {
  if (square) return [{ x: x - radius, y: y - radius }, { x: x + radius, y: y - radius }, { x: x + radius, y: y + radius }, { x: x - radius, y: y + radius }];
  return Array.from({ length: 16 }, (_, k) => ({ x: x + Math.cos((k / 16) * Math.PI * 2) * radius, y: y + Math.sin((k / 16) * Math.PI * 2) * radius }));
}

/** Rings as clipping gives them back, outlines with the holes that lie in each. */
function withHoles(rings: Vec[][]): { ring: Vec[]; holes: Vec[][] }[] {
  const outlines = rings.filter(ring => signedArea(ring) > 0);
  const holes = rings.filter(ring => signedArea(ring) < 0);
  return outlines.map(ring => ({ ring, holes: holes.filter(hole => inside(ring, hole[0]!)) }));
}

/** The share of a cave's pool a stream must fill to carry the whole pool along with it. */
const STREAM_SHARE = 0.25;

/**
 * The floor's pools of water, on what of them lies on the floor (the map clips them there too) and
 * off its built water, which keeps its own banks. A cave's pool holds its deep water, and flows
 * where a stream fills enough of it. Lava and acid are hazards of their own, never pools.
 */
function poolLiquids(dungeon: VisibleDungeon): Liquid[] {
  const floorRings = floorRingsOf(dungeon);
  const { floor } = dungeon;
  const built = cellRings(floor.terrain.filter(piece => isBuiltWater(floor, piece)).flatMap(piece => piece.cells));
  const streams = floor.terrain.filter(piece => isNaturalDeepWater(floor, piece) && piece.kind === 'channel' && piece.facing);
  // All shores at once, as the map fills them: an island's shore is a hole in its lake, never water of its own.
  const onFloor = intersectRings(floor.water.map(pool => smoothClosedPoints(pool.outline, 4)), floorRings);
  return withHoles(built.length ? subtractRings(onFloor, built) : onFloor).map(({ ring, holes }): Liquid => {
    const flow = streamThrough(ring, streams);
    return { liquid: 'water', ring, ...(holes.length && { holes }), ...(flow && { flow }) };
  });
}

/** The way the stream that fills most of a pool runs, where it fills at least `STREAM_SHARE` of it. */
function streamThrough(ring: readonly Vec[], streams: readonly DungeonTerrain[]): Vec | undefined {
  const area = signedArea(ring);
  let best: DungeonTerrain | undefined;
  let most = 0;
  for (const stream of streams) {
    const cells = stream.cells.filter(c => inside(ring, { x: c.x + 0.5, y: c.y + 0.5 })).length;
    if (cells > most) { most = cells; best = stream; }
  }
  return best?.facing && most >= area * STREAM_SHARE ? { x: best.facing.x, y: best.facing.y } : undefined;
}

function floorRingsOf(dungeon: VisibleDungeon): Vec[][] {
  return unionRings(dungeon.floors.flatMap(shape => shapeRings(shape, 0, 100)));
}

/** Terrain that is part of the water itself, not drawn over it. */
const UNDER_WATER: ReadonlySet<string> = new Set(['shallow-water']);

/** The outline a piece of terrain is drawn with over the water: rimstone as its dams, none where it lies submerged. */
function terrainOver(floor: DungeonFloor, view: DungeonView, piece: DungeonTerrain): Vec[][] {
  if (piece.kind !== 'rimstone') return cellRings(piece.cells);
  if (view.water && isSubmergedRimstone(floor, piece)) return [];
  return unionRings(rimstoneShelves(floor, piece).rims);
}

/**
 * What the map draws over its water: stairwells, every piece of terrain that is no liquid (bridges
 * among them; rimstone as its dams, none where the water lies over it and the map draws only their
 * lips), props and columns. Cut out of the surfaces, so the motion never runs over them.
 */
function drawnOver(dungeon: VisibleDungeon, view: DungeonView): Vec[][] {
  const { floor, roomShapes } = dungeon;
  const stairs = floor.stairs.map(({ x, y, w, h }) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]);
  const terrain = floor.terrain
    .filter(piece => roomShapes.has(piece.room) && !UNDER_WATER.has(piece.kind) && !(piece.traits.hazard && HAZARD_LIQUID[piece.traits.hazard]))
    .flatMap(piece => terrainOver(floor, view, piece));
  const props = view.props ? floor.props.filter(prop => roomShapes.has(prop.room)).map(propPolygon) : [];
  return [...stairs, ...terrain, ...props, ...floor.columns.map(columnRing)];
}

/** Each liquid with what the map draws over it cut out: islands as holes, a surface cut in two as two, each within `MAX_LIQUID_CORNERS`. */
function cutOut(found: readonly Liquid[], over: readonly Vec[][]): Liquid[] {
  return found.flatMap(({ ring, holes = [], ...rest }) =>
    withHoles(over.length ? subtractRings([ring, ...holes], over) : [ring, ...holes])
      .filter(cut => cut.ring.length >= 3 && signedArea(cut.ring) > 0.05)
      .map((cut): Liquid => {
        const [ring, ...holes] = fitCorners([cut.ring, ...cut.holes], MAX_LIQUID_CORNERS);
        return { ...rest, ring: ring!, ...(holes.length && { holes }) };
      }));
}

/** Positive for an outline, negative for a hole, as clipping orients them. */
function signedArea(ring: readonly Vec[]): number {
  let sum = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    sum += p.x * q.y - q.x * p.y;
  });
  return sum / 2;
}

function inside(polygon: readonly Vec[], p: Vec): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The middle of an outline, by area. */
function centroid(ring: readonly Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  });
  return a === 0 ? ring[0]! : { x: cx / (3 * a), y: cy / (3 * a) };
}

/** How lava and acid glow, in cells: lava lights its room, acid only its shore. */
const GLOWS: Readonly<Partial<Record<LiquidKind, { bright: number; dim: number; color: string; intensity: number }>>> = {
  lava: { bright: 1, dim: 4, color: '#ff8a3d', intensity: 1 },
  acid: { bright: 0, dim: 1.5, color: '#9be05a', intensity: 0.5 },
};

export interface FloorLiquids {
  liquids: Record<string, LiquidSurface>;
  lights: Record<string, LightSource>;
}

/**
 * The floor's liquids as surfaces of its level, and a glowing light over each lava and acid, its
 * ranges in the collection's units (`unit`; a cell of the dungeon is two squares with small tiles).
 */
export function floorLiquids(
  dungeon: VisibleDungeon,
  style: DungeonStyle,
  view: DungeonView,
  placement: DungeonPlacement,
  unit: SceneUnit,
  id: string,
  level?: string,
): FloorLiquids {
  const shown = dungeon.floor.terrain.filter(piece => dungeon.roomShapes.has(piece.room));
  const whole = [...(view.water ? poolLiquids(dungeon) : []), ...terrainLiquids(dungeon, shown, dungeon.floors.some(shape => shape.kind === 'poly') ? floorRingsOf(dungeon) : null, view.water)].map((piece, index) => ({ ...piece, ...(piece.liquid === 'lava' && { lavaLight: `light_${id}_${index + 1}` }) }));
  const colours = liquidColours(style, view);
  const { originCell, pxPerCell } = placement;
  const world = (p: Vec): Vec => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  const units = (cells: number): number => cellsToUnits(cells, view, unit);
  const liquids: Record<string, LiquidSurface> = {};
  cutOut(whole, drawnOver(dungeon, view)).forEach(({ liquid, ring, holes, flow, lavaLight }, index) => {
    const liquidId = `liquid_${id}_${index + 1}`;
    liquids[liquidId] = { id: liquidId, kind: 'liquid', liquid, polygon: ring.map(world), ...(holes && { holes: holes.map(hole => hole.map(world)) }), ...(flow && { flow }), colors: colours[liquid], ...(style.direction === 'engraved' && { art: 'engraved' }), ...(lavaLight && { lavaLight }), ...(level && { level }) };
  });
  // The glow comes from the whole of the lava, under its bridges and what stands in it too
  const lights: Record<string, LightSource> = {};
  whole.forEach(({ liquid, ring }, index) => {
    const glow = GLOWS[liquid];
    if (!glow) return;
    const area = fitCorners([ring], MAX_AREA_CORNERS)[0]!.map(world);
    const middle = centroid(area);
    const emission: LightEmission = { bright: units(glow.bright), dim: units(glow.dim), color: liquid === 'lava' && (style.direction === 'engraved' || view.monochrome) ? colours.lava.glint : glow.color, intensity: glow.intensity, animation: 'smoulder', kind: 'custom' };
    const lightId = `light_${id}_${index + 1}`;
    lights[lightId] = { id: lightId, kind: 'light', x: middle.x, y: middle.y, emission, area, ...(level && { levels: [level] }) };
  });
  return { liquids, lights };
}

