/**
 * An outbuilding as structure only, its inside empty: masonry walls round its cells with a door in
 * their gap, its roof's edge as the dashed line of the eaves beyond the walls; a greenhouse instead
 * stands on a low wall under glass, its ridge and hips and the bars of its glazing seen from above.
 * The family crypt is closed by an iron grille, every other building by a planked door.
 */

import type { GroundsPiece } from '../../model';
import type { Hand } from '../art/hand';
import { axisFrame, polyPath, polysPath, rectPoly, stepsAlong } from '../art/paths';
import type { Vec } from '../geometry';
import { circle } from '../terrain/cover';
import { standingEdges } from './boundary';
import type { Outbuilding, OutbuildingDoor } from './groundsShapes';
import { withClip, type GroundsPaint } from './paint';

/** The eaves beyond the walls: how far out, and the dashes they are drawn in. */
const EAVES = { out: 0.11, dash: 0.14, gap: 0.09 };
/** Joints across a wall, this far apart. */
const BLOCK = 0.32;

export function drawOutbuilding(hand: Hand, paint: GroundsPaint, piece: GroundsPiece, building: Outbuilding): void {
  const { box, wall, walls, door } = building;
  const glass = piece.use === 'greenhouse';
  if (glass) glazing(hand, paint, building.inside);
  hand.surface(polysPath(walls), 'dressed');
  if (!glass) withClip(hand.scene.env.ctx, polysPath(walls), () => hand.line(blockJoints(box, wall), 'fine'));
  standingEdges(hand, walls);
  if (door) drawDoor(hand, door, wall, piece.use === 'crypt');
  if (!glass) hand.line(eaves(box), 'fine');
}

/** Joints across the wall all round, so it reads as laid stone; drawn inside the walls, so the doorway's gap stays clear. */
function blockJoints(box: Outbuilding['box'], wall: number): Vec[][] {
  const lines: Vec[][] = [];
  for (let x = box.x + BLOCK; x < box.x + box.w - 0.1; x += BLOCK) lines.push([{ x, y: box.y }, { x, y: box.y + wall }], [{ x: x + BLOCK / 2, y: box.y + box.h - wall }, { x: x + BLOCK / 2, y: box.y + box.h }]);
  for (let y = box.y + BLOCK; y < box.y + box.h - 0.1; y += BLOCK) lines.push([{ x: box.x, y: y + BLOCK / 2 }, { x: box.x + wall, y: y + BLOCK / 2 }], [{ x: box.x + box.w - wall, y }, { x: box.x + box.w, y }]);
  return lines;
}

/** The eaves: a dashed line round the walls, where the roof's edge lies above the ground. */
function eaves(box: Outbuilding['box']): Vec[][] {
  const ring = rectPoly({ x: box.x - EAVES.out, y: box.y - EAVES.out, w: box.w + EAVES.out * 2, h: box.h + EAVES.out * 2 });
  return stepsAlong(ring, EAVES.dash + EAVES.gap, 0, 0.02).map(({ p, t }) => [p, { x: p.x + t.x * EAVES.dash, y: p.y + t.y * EAVES.dash }]);
}

/** A greenhouse's roof of glass: panes over the inside, its ridge along the long side, hips to the corners and bars between the panes. */
function glazing(hand: Hand, paint: GroundsPaint, inside: Outbuilding['inside']): void {
  const pane = rectPoly(inside);
  paint.glass(polyPath(pane));
  const long = inside.w >= inside.h;
  const half = (long ? inside.h : inside.w) / 2;
  const c = { x: inside.x + inside.w / 2, y: inside.y + inside.h / 2 };
  const ends = long ? [{ x: inside.x + half, y: c.y }, { x: inside.x + inside.w - half, y: c.y }] : [{ x: c.x, y: inside.y + half }, { x: c.x, y: inside.y + inside.h - half }];
  const bars: Vec[][] = [];
  const [a0, a1] = long ? [inside.x, inside.x + inside.w] : [inside.y, inside.y + inside.h];
  for (let u = a0 + 0.25; u < a1 - 0.1; u += 0.25) bars.push(long ? [{ x: u, y: inside.y }, { x: u, y: inside.y + inside.h }] : [{ x: inside.x, y: u }, { x: inside.x + inside.w, y: u }]);
  hand.line(bars, 'fine');
  const [p, q, r, s] = pane as [Vec, Vec, Vec, Vec];
  const [e0, e1] = ends as [Vec, Vec];
  hand.line([[e0, e1], [p, e0], [s, e0], [q, e1], [r, e1]], 'outline');
}

/** The door in an outbuilding's doorway, in the middle of the wall: planks bound with iron, or a crypt's grille of bars. */
function drawDoor(hand: Hand, door: OutbuildingDoor, wall: number, grille: boolean): void {
  const centre = { x: door.mid.x + (door.inward.x * wall) / 2, y: door.mid.y + (door.inward.y * wall) / 2 };
  const { at, quad } = axisFrame(centre, door.across, door.inward);
  const leaf = quad(-0.36, -0.045, 0.36, 0.045);
  if (grille) {
    const heads = Array.from({ length: 8 }, (_, k) => circle(at(-0.32 + (k * 0.64) / 7, 0), 0.022, 10));
    hand.surface(polyPath(leaf), 'metal');
    hand.edges(leaf, true);
    hand.fill(polysPath(heads), 'metal');
    hand.line(heads, 'fine', true);
    return;
  }
  hand.surface(polyPath(leaf), 'wood');
  hand.line([-0.18, 0, 0.18].map((u) => [at(u, -0.045), at(u, 0.045)]), 'fine');
  hand.edges(leaf, true);
}
