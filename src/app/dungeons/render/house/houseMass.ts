/**
 * A house's masonry as drawn (`DungeonFloor.walls === 'edges'`): everything inside its outer face
 * that is no floor. Its outer walls stand on the cell edges round the house, `OUTER_WALL` thick, so
 * the edge is their middle line; its inner walls and chimney stacks lie between the rooms.
 */

import { cellsOf, floorCellsOf, floorRect } from '../../geometry';
import type { DungeonFloor } from '../../model';
import { grownRings } from '../clipShapes';
import { cellsRings, outerTurn, signedArea2, tracePolygon, type Vec } from '../geometry';
import { OUTER_WALL, windowClearing } from '../houseShapes';
import type { ArtScene } from '../art/artScene';
import { polyPath, rectPoly } from '../art/paths';
import { traceRings } from '../art/outline';
import { mouthsOf } from '../art/mouths';
import { shownWindows } from '../art/windows';

export interface HouseMass {
  /** The cell edges the outer walls stand on: their middle line, as rings round the house's cells. */
  centre: Vec[][];
  /** The outer walls' outer face, as rings; `holes` marks those round a courtyard. */
  outline: Vec[][];
  holes: boolean[];
}

const masses = new WeakMap<DungeonFloor, HouseMass>();

/** A house floor's masonry, worked out once per floor; null for a floor that is no house. */
export function houseMass(floor: DungeonFloor): HouseMass | null {
  if (floor.walls !== 'edges') return null;
  let mass = masses.get(floor);
  if (!mass) {
    const cells = [...floor.rooms.flatMap(floorCellsOf), ...(floor.stacks ?? []).flatMap((s) => cellsOf(floorRect(s)))];
    const centre = cellsRings(cells);
    const outline = grownRings(centre, OUTER_WALL / 2, 'miter');
    const turn = outerTurn(outline);
    mass = { centre, outline, holes: outline.map((ring) => Math.sign(signedArea2(ring)) !== turn) };
    masses.set(floor, mass);
  }
  return mass;
}

/** Restricts drawing to the masonry: inside the outer face, off the floors and out of every window's cut. */
export function clipToMass(scene: ArtScene, mass: HouseMass): void {
  const { ctx } = scene.env;
  clipOutWindowsAndDoors(scene, 0.04);
  ctx.beginPath();
  traceRings(ctx, mass.outline);
  traceRings(ctx, scene.floorRings);
  ctx.clip('evenodd');
}

/**
 * Restricts drawing to everything but the cuts through the outer walls: each window's from its
 * floor out past the wall by `beyond`, and each way in across its doorway, from the room's floor
 * out past the wall's outer face.
 */
export function clipOutWindowsAndDoors(scene: ArtScene, beyond: number): void {
  const { ctx, dungeon } = scene.env;
  const windows = shownWindows(dungeon);
  const doors = mouthsOf(dungeon);
  if (windows.length === 0 && doors.length === 0) return;
  const g = scene.grid;
  ctx.beginPath();
  ctx.rect(g.x0, g.y0, g.w / g.res, g.h / g.res);
  for (const window of windows) polyPath(windowClearing(window, beyond))(ctx);
  for (const { at, out, width } of doors) {
    // From the mouth on the outer face back through the wall to the floor, and a little beyond.
    const back = OUTER_WALL + 0.04;
    const ends = [-1, 1].map((side) => ({ x: at.x - out.y * (width / 2) * side, y: at.y + out.x * (width / 2) * side }));
    const xs = ends.flatMap((p) => [p.x - out.x * back, p.x + out.x * beyond]);
    const ys = ends.flatMap((p) => [p.y - out.y * back, p.y + out.y * beyond]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    tracePolygon(ctx, rectPoly({ x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }));
  }
  ctx.clip('evenodd');
}

/** One straight run of an outer wall's middle line, with the way out of the house. */
export interface WallRun {
  a: Vec;
  b: Vec;
  out: Vec;
}

/** The outer walls' middle line run by run, each with the side the outside lies on. */
export function wallRuns(mass: HouseMass, inside: (x: number, y: number) => boolean): WallRun[] {
  const runs: WallRun[] = [];
  for (const ring of mass.centre) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-6) return;
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const probe = { x: (a.x + b.x) / 2 + n.x * 0.25, y: (a.y + b.y) / 2 + n.y * 0.25 };
      runs.push({ a, b, out: inside(probe.x, probe.y) ? { x: -n.x, y: -n.y } : n });
    });
  }
  return runs;
}
