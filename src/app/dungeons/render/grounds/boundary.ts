/**
 * What closes a house's grounds and divides them: the boundary wall, coursed masonry under a
 * saddleback coping whose ridge runs along its middle; clipped hedges, a dense box of leaves with
 * its flat top; and gates between square piers with ball finials, of iron at the front (a top rail
 * and the spear heads of its bars, two leaves meeting in the middle) and of timber at the service
 * gate. Each is drawn on its whole cells, so the scene's walls on their edges lie on its ink.
 */

import { cellKey, cellsBox } from '../../geometry';
import type { GroundsPiece } from '../../model';
import type { Hand } from '../art/hand';
import { TO_LIGHT } from '../art/light';
import { axisFrame, polyPath, polysPath } from '../art/paths';
import { grownRings } from '../clipShapes';
import { cellsRings, signedArea2, type Vec } from '../geometry';
import { circle } from '../terrain/cover';
import { cellSet } from '../terrain/pieces';
import type { GroundsPaint } from './paint';

/** The coping's inset from the wall's faces, in cells. */
const COPING = 0.2;
/** A gate pier's length along the wall, in cells. */
const PIER = 0.62;
/** A coping stone's length, and how far apart the joints of the courses below it lie. */
const COPING_STONE = 0.5;
const COURSE = 0.3;

/** A ring's edges as standing up: a hole's from the other side, since the wall stands round it. */
export function standingEdges(hand: Hand, rings: readonly Vec[][]): void {
  for (const ring of rings) hand.edges(ring, signedArea2(ring) > 0);
}

export function drawBoundaryWall(hand: Hand, wall: GroundsPiece): void {
  const rings = cellsRings(wall.cells);
  hand.surface(polysPath(rings), 'dressed');
  const coping = grownRings(rings, -COPING, 'miter');
  const keys = cellSet(wall.cells);
  const has = (x: number, y: number): boolean => keys.has(cellKey(x, y));
  const ridge: Vec[][] = [];
  const faceJoints: Vec[][] = [];
  const copingJoints: Vec[][] = [];
  for (const c of wall.cells) {
    const mid = { x: c.x + 0.5, y: c.y + 0.5 };
    if (has(c.x + 1, c.y)) ridge.push([mid, { x: mid.x + 1, y: mid.y }]);
    if (has(c.x, c.y + 1)) ridge.push([mid, { x: mid.x, y: mid.y + 1 }]);
    const across = has(c.x - 1, c.y) || has(c.x + 1, c.y);
    // A corner, or a wall's end alone, takes no joints.
    if (across === (has(c.x, c.y - 1) || has(c.x, c.y + 1))) continue;
    // `along` runs the wall's way, `out` across it, both from the cell's corner.
    const at = (along: number, out: number): Vec => (across ? { x: c.x + along, y: c.y + out } : { x: c.x + out, y: c.y + along });
    // Joints across the faces below the coping, staggered between the two faces, and across the coping stones.
    for (const [face, shift] of [[COPING / 2, 0], [1 - COPING / 2, COURSE / 2]] as const) {
      for (let s = 0.1 + shift; s < 1; s += COURSE) faceJoints.push([at(s, face - COPING / 2), at(s, face + COPING / 2)]);
    }
    for (const s of [0.25, 0.25 + COPING_STONE]) copingJoints.push([at(s, COPING), at(s, 1 - COPING)]);
  }
  hand.line(faceJoints, 'fine');
  hand.surface(polysPath(coping), 'stone');
  hand.line([...ridge, ...copingJoints], 'fine');
  standingEdges(hand, coping);
  standingEdges(hand, rings);
}

export function drawHedge(hand: Hand, paint: GroundsPaint, hedge: GroundsPiece): void {
  const rings = cellsRings(hedge.cells);
  const first = hedge.cells[0]!;
  paint.foliage(rings, 0.1, first.x * 13 + first.y * 7, hedge.cells);
  // The flat top a hedge is clipped to, its sides falling away below it.
  hand.line(grownRings(rings, -0.11, 'round'), 'fine', true);
  standingEdges(hand, rings);
}

/** A gate across its cells' middle between two piers: iron leaves where it is the way in for guests, a timber leaf at the service gate. */
export function drawGate(hand: Hand, gate: GroundsPiece): void {
  const dir = gate.dir;
  if (!dir) return;
  const box = cellsBox(gate.cells);
  const along = dir.y !== 0;
  const [u0, u1] = along ? [box.x, box.x + box.w] : [box.y, box.y + box.h];
  const v = along ? box.y + box.h / 2 : box.x + box.w / 2;
  // `u` along the boundary, `dv` across it from its middle line.
  const frame = along ? axisFrame({ x: 0, y: v }, { x: 1, y: 0 }, { x: 0, y: 1 }) : axisFrame({ x: v, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 });
  const { at } = frame;
  const quad = (a: number, b: number, half: number): Vec[] => frame.quad(a, -half, b, half);
  // The piers are the wall's ends, as wide as the wall, their faces the gateway's sides; the leaves first, so the piers' faces stand over their ends.
  const lines: Vec[][] = [];
  if (u1 - u0 >= 2) lines.push(...ironLeaves(hand, u0, u1, at, quad));
  else timberLeaf(hand, u0, u1, at, quad);
  lines.push(...drawPiers(hand, [quad(u0 - PIER, u0, 0.5), quad(u1, u1 + PIER, 0.5)]));
  hand.line(lines, 'fine', true);
}

/** Two iron leaves meeting in the middle: each a top rail with the spear heads of its bars, a drop bolt where they meet; their outlines for the caller to draw. */
function ironLeaves(hand: Hand, a: number, b: number, at: (u: number, dv: number) => Vec, quad: (a: number, b: number, half: number) => Vec[]): Vec[][] {
  const mid = (a + b) / 2;
  const rails = [quad(a, mid - 0.015, 0.04), quad(mid + 0.015, b, 0.04)];
  const bars = Math.max(2, Math.round((mid - a) / 0.13));
  const heads = [a, mid + 0.015].flatMap((from) => Array.from({ length: bars + 1 }, (_, k) => circle(at(from + ((mid - 0.015 - a) * k) / bars, 0), k === 0 || k === bars ? 0.045 : 0.03, 8)));
  const bolt = quad(mid - 0.035, mid + 0.035, 0.065);
  hand.surface(polysPath([...rails, bolt]), 'metal');
  hand.fill(polysPath(heads), 'metal');
  return [...rails, bolt, ...heads];
}

function timberLeaf(hand: Hand, a: number, b: number, at: (u: number, dv: number) => Vec, quad: (a: number, b: number, half: number) => Vec[]): void {
  const leaf = quad(a, b, 0.06);
  hand.surface(polyPath(leaf), 'wood');
  const planks: Vec[][] = [];
  for (let u = a + 0.12; u < b - 0.05; u += 0.12) planks.push([at(u, -0.06), at(u, 0.06)]);
  hand.line(planks, 'fine');
  hand.edges(leaf, true);
}

/** Gate piers: blocks of dressed stone, their caps bevelled, a ball on each lit on its crown; their fine lines for the caller to draw. */
function drawPiers(hand: Hand, piers: readonly Vec[][]): Vec[][] {
  const centres = piers.map((pier) => ({ x: (pier[0]!.x + pier[2]!.x) / 2, y: (pier[0]!.y + pier[2]!.y) / 2 }));
  const caps = piers.map((pier, k) => pier.map((p) => ({ x: p.x + Math.sign(centres[k]!.x - p.x) * 0.07, y: p.y + Math.sign(centres[k]!.y - p.y) * 0.07 })));
  hand.surface(polysPath(piers), 'dressed');
  for (const pier of piers) hand.edges(pier, true);
  const balls = centres.map((c) => circle(c, 0.17, 24));
  const lit = centres.map((c) => circle({ x: c.x + TO_LIGHT.x * 0.06, y: c.y + TO_LIGHT.y * 0.06 }, 0.08, 16));
  hand.fill(polysPath(balls), 'stone');
  hand.fill(polysPath(lit), 'raised');
  return [...piers.flatMap((pier, k) => caps[k]!.map((p, i) => [pier[i]!, p])), ...caps, ...balls];
}
