import type { CellPoint, DungeonFloor, DungeonTerrain } from '../../model';
import { chaikin, resample } from '../../water/smooth';
import { cellRings } from '../terrain/cellRings';
import type { Vec } from '../geometry';
import { smoothClosedPoints, traceSmoothClosed } from '../geometry';
import type { ArtScene } from './artScene';
import { valueNoise } from './noise';
import { smoothstep, type Field, type PathFn } from './paths';
import { blurField, fieldOf, gridOver, insideDistance, pathMask, sampleField } from './raster';
import { pointsBounds } from '../geometry';

/** Whether the floor's water lies over all of a piece of rimstone, as it may at a lake's edge: the map then draws only its dams' lips, through the water. */
export function isSubmergedRimstone(floor: DungeonFloor, piece: DungeonTerrain): boolean {
  if (piece.kind !== 'rimstone') return false;
  const wet = new Set(floor.waterCells.map(c => `${c.x},${c.y}`));
  return piece.cells.every(c => wet.has(`${c.x},${c.y}`));
}

/** The pools of the floor as drawn: their smoothed outlines, or none where the view hides water. */
export function poolOutlines(scene: ArtScene): Vec[][] {
  const { env } = scene;
  return env.view.water ? env.dungeon.floor.water.map(pool => pool.outline) : [];
}

export function poolsPath(outlines: readonly Vec[][]): PathFn {
  return path => outlines.forEach(outline => traceSmoothClosed(path, outline));
}

/**
 * The shores `poolsPath` draws, as points: what is drawn along a shore (a lit lip, contours) follows
 * these, never the corners the curve is traced through, or it runs off the shore as straight chords.
 */
export function poolShores(outlines: readonly Vec[][]): Vec[][] {
  return outlines.map(outline => smoothClosedPoints(outline, 8));
}

/** Distance into the shapes `trace` adds, from their shore, in cells; 0 outside. Worked out on a grid of their own. */
export function depthField(scene: ArtScene, trace: PathFn, points: readonly Vec[]): Field {
  if (!points.length) return () => 0;
  const b = pointsBounds(points);
  const grid = gridOver(b.minX - 0.5, b.minY - 0.5, b.maxX + 0.5, b.maxY + 0.5, scene.grid.res);
  const depth = insideDistance(grid, pathMask(grid, trace));
  return (x, y) => sampleField(grid, depth, x, y);
}

/**
 * Whether a piece is deep water of a cave: part of the cave's water, traced with it into one body
 * (`placeWater`'s `deep`) and drawn as that body's depth, never as a water of its own. Built water
 * (a fortress' cistern, a mansion's channel) keeps its dressed banks.
 */
export function isNaturalDeepWater(floor: Pick<DungeonFloor, 'cave'>, piece: DungeonTerrain): boolean {
  return floor.cave !== undefined && piece.traits.hazard === 'deep-water';
}

/** How far into the deep part of its water a point lies, 0 (shallow) to 1: soft, its cells' corners lost, its edge wavering. */
export function deepnessField(scene: ArtScene): Field | null {
  const { floor } = scene.env.dungeon;
  const cells = floor.terrain.filter(piece => isNaturalDeepWater(floor, piece)).flatMap(piece => piece.cells);
  if (!cells.length || !scene.env.view.water) return null;
  const b = pointsBounds(cells.flatMap(c => [c, { x: c.x + 1, y: c.y + 1 }]));
  const res = Math.min(8, scene.grid.res);
  const grid = gridOver(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1, res);
  const deep = new Set(cells.map(c => `${c.x},${c.y}`));
  const mask = fieldOf(grid, (x, y) => (deep.has(`${Math.floor(x)},${Math.floor(y)}`) ? 1 : 0));
  // Blurred over most of a cell: the cells' squares become one rounded basin.
  const soft = blurField(grid, mask, 0.7 * res);
  const seed = scene.env.dungeon.model.seed;
  return (x, y) => {
    const v = sampleField(grid, soft, x, y);
    if (v <= 0) return 0;
    const waver = (valueNoise(x * 1.7, y * 1.7, seed + 61) - 0.5) * 0.4;
    return smoothstep(0.2, 0.8, v + waver);
  };
}

/**
 * A cave's deep water as a shore of its own, where the view hides the floor's water it is part of:
 * its cells' outline loosened into a rounded, wavering line, never their rectangle.
 */
export function naturalDeepRings(cells: readonly CellPoint[], seed: number): Vec[][] {
  return cellRings(cells).map(ring => chaikin(resample(ring, 0.5).map(p => ({
    x: p.x + (valueNoise(p.x * 1.9, p.y * 1.9, seed + 71) - 0.5) * 0.5,
    y: p.y + (valueNoise(p.x * 1.9, p.y * 1.9, seed + 72) - 0.5) * 0.5,
  })), 3));
}

/** Water that is built, so it keeps its dressed banks: a built theme's deep water and channels, and every rimmed pool. */
export function isBuiltWater(floor: Pick<DungeonFloor, 'cave'>, piece: DungeonTerrain): boolean {
  return piece.kind === 'pool' || (piece.traits.hazard === 'deep-water' && !isNaturalDeepWater(floor, piece));
}

/**
 * Keeps what is drawn next out of the floor's built water, so the floor's water ends at its banks
 * and never lies over it (evenodd: everything, less the built water's cells near a pool). False where none is near.
 */
export function clipOutBuiltWater(scene: ArtScene, ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D): boolean {
  const { floor } = scene.env.dungeon;
  const pools = poolOutlines(scene).map(pointsBounds);
  const reaches = (c: CellPoint): boolean => pools.some(b => c.x < b.maxX && c.x + 1 > b.minX && c.y < b.maxY && c.y + 1 > b.minY);
  const cells = floor.terrain.filter(piece => isBuiltWater(floor, piece)).flatMap(piece => piece.cells).filter(reaches);
  if (!cells.length) return false;
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  for (const ring of cellRings(cells)) {
    ctx.moveTo(ring[0]!.x, ring[0]!.y);
    for (const p of ring.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  }
  ctx.clip('evenodd');
  return true;
}
