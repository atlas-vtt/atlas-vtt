/**
 * A house's walls, drawn once through a hand in place of a dungeon's rock and wall course: every
 * part of the house that is no floor is masonry. The outer walls are solid, two stones thick, their
 * joints staggered between the two faces and their outer face standing up from the ground, lit
 * where it faces the light; the inner walls are thin partitions, and the chimney stacks are coursed
 * brick or stone with their flues.
 */

import { cellKey } from '../../geometry';
import type { Hand } from '../art/hand';
import { hash2 } from '../art/noise';
import { polysPath } from '../art/paths';
import { pointsBounds, type Vec } from '../geometry';
import { OUTER_WALL } from '../houseShapes';
import { drawStack, masonryCourse } from './stacks';
import { clipOutWindowsAndDoors, clipToMass, houseMass, wallRuns, type HouseMass, type WallRun } from './houseMass';

/** How deep a shade the masonry takes. */
const MASS_TONE = 0.24;

/** Draws a house floor's masonry, under its floors; false where the floor is no house. */
export function drawHouseMass(hand: Hand): boolean {
  const { scene } = hand;
  const { ctx, dungeon } = scene.env;
  const mass = houseMass(dungeon.floor);
  if (!mass) return false;
  ctx.save();
  clipToMass(scene, mass);
  hand.surface(polysPath(mass.outline), 'dressed');
  // Cut masonry reads a shade deeper than the floors it stands between: Stone darkens it, Engraved hatches it lightly.
  const bounds = pointsBounds(mass.outline.flat());
  hand.tone(() => MASS_TONE, bounds, polysPath(mass.outline), 'shade');
  outerJoints(hand, mass);
  for (const stack of dungeon.floor.stacks ?? []) drawStack(hand, stack);
  ctx.restore();
  ctx.save();
  clipOutWindowsAndDoors(scene, 0.06);
  mass.outline.forEach((ring, k) => hand.edges(ring, !mass.holes[k]));
  ctx.restore();
  return true;
}

/** The outer walls' stones: one joint along the wall's middle between its two faces, and joints across each face, staggered. */
function outerJoints(hand: Hand, mass: HouseMass): void {
  const { dungeon, style } = hand.scene.env;
  const seed = dungeon.model.seed;
  const cells = dungeon.house?.cells;
  if (!cells) return;
  const inside = (x: number, y: number): boolean => cells.has(cellKey(Math.floor(x), Math.floor(y)));
  const { length } = masonryCourse(style);
  const half = OUTER_WALL / 2;
  const lines: Vec[][] = [];
  for (const run of wallRuns(mass, inside)) {
    lines.push([run.a, run.b]);
    for (const face of [-1, 1]) lines.push(...faceJoints(run, face, half, length, seed));
  }
  hand.line(lines, 'fine');
}

/** Joints across one face of a run (`face` −1 inside the middle line, 1 outside), every stone's length, offset by half a stone between faces. */
function faceJoints(run: WallRun, face: number, half: number, length: number, seed: number): Vec[][] {
  const { a, b, out } = run;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  // Stones are laid along the whole wall, so their joints are placed by where they lie, not by run.
  const along = t.x * a.x + t.y * a.y;
  const across = t.x !== 0 ? a.y : a.x;
  const offset = face > 0 ? length / 2 : 0;
  const joints: Vec[][] = [];
  const first = Math.ceil((along - offset) / length);
  for (let k = first; (k * length + offset - along) < len; k++) {
    const jitter = (hash2(k, Math.round(across * 4) * 2 + (face > 0 ? 1 : 0), seed) - 0.5) * length * 0.3;
    const s = k * length + offset - along + jitter;
    if (s < 0.04 || s > len - 0.04) continue;
    const p = { x: a.x + t.x * s, y: a.y + t.y * s };
    joints.push([p, { x: p.x + out.x * half * face, y: p.y + out.y * half * face }]);
  }
  return joints;
}
