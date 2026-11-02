/**
 * What lies flat on a house's grounds, drawn before light and shade: the lawn over the lot, the
 * gravel of paths and drive kerbed with a row of setts, the porch's paved platform with its steps,
 * and the paving inside each outbuilding. Then the shade the house, walls, hedges and trees cast
 * on the open ground.
 */

import { cellsBox } from '../../geometry';
import type { GroundsPiece } from '../../model';
import { castShadow, type Hand } from '../art/hand';
import { polysPath, rectPoly, stepsAlong } from '../art/paths';
import { grownRings, unionRings } from '../clipShapes';
import { outerTurn, pointsBounds, type Vec } from '../geometry';
import { piecesOf, type GroundsLayout, type Outbuilding } from './groundsShapes';
import type { GroundsPaint } from './paint';

/** A kerb of setts along the ways: its width and the length of a sett, in cells. */
const KERB = { width: 0.07, sett: 0.14 };

export function drawGroundsGround(hand: Hand, paint: GroundsPaint, layout: GroundsLayout): void {
  paint.lawn(polysPath(layout.open), layout.lawnCells);
  drawWays(hand, paint, layout.ways, layout.wayCells);
  for (const porch of piecesOf(layout, 'porch')) drawPorchFloor(hand, porch);
  for (const [piece, building] of layout.outbuildings) drawOutbuildingFloor(hand, piece, building);
}

/** The gravel of the paths and drive over `rings`, its pebbles over `cells`, kerbed along every edge. */
export function drawWays(hand: Hand, paint: GroundsPaint, rings: readonly Vec[][], cells: readonly Vec[]): void {
  if (!rings.length) return;
  paint.gravel(polysPath(rings), cells);
  // Every ring keeps the ways on the same side of its way round, so one turn serves them all.
  const turn = outerTurn(rings);
  const joints = rings.flatMap((ring) => stepsAlong(ring, KERB.sett, KERB.sett / 2, KERB.sett / 3)).map(({ p, t }) => [p, { x: p.x - t.y * turn * KERB.width, y: p.y + t.x * turn * KERB.width }]);
  hand.line(joints, 'fine');
  hand.line([...rings, ...grownRings(rings, -KERB.width, 'miter')], 'fine', true);
}

/** The porch's platform of stone slabs, two steps down at its front, the side its columns stand on. */
export function drawPorchFloor(hand: Hand, porch: GroundsPiece): void {
  const box = cellsBox(porch.cells);
  const up = (porch.columns?.[0]?.y ?? Infinity) < box.y + box.h / 2;
  // `y` of the band that lies `from` to `to` cells back from the front.
  const band = (from: number, to: number, grow = 0): Vec[] => rectPoly({ x: box.x - grow, y: up ? box.y + from : box.y + box.h - to, w: box.w + grow * 2, h: to - from });
  const steps = [band(0, 0.11, 0.02), band(0.11, 0.22)];
  for (const step of steps) {
    hand.surface(polysPath([step]), 'stone');
    hand.edges(step, true);
  }
  const platform = band(0.22, 1, -0.04);
  hand.surface(polysPath([platform]), 'raised');
  const slab = up ? box.y + 0.6 : box.y + box.h - 0.6;
  const slabs: Vec[][] = [[{ x: box.x + 0.04, y: slab }, { x: box.x + box.w - 0.04, y: slab }]];
  for (let x = box.x + 0.5; x < box.x + box.w - 0.1; x += 0.5) slabs.push([{ x, y: platform[0]!.y }, { x, y: platform[2]!.y }]);
  hand.line(slabs, 'fine');
  hand.edges(platform, true);
}

/** An outbuilding's paving: setts in a carriage house or stable, flags in a crypt, a brick walk between beds in a greenhouse. */
export function drawOutbuildingFloor(hand: Hand, piece: GroundsPiece, building: Outbuilding): void {
  const glass = piece.use === 'greenhouse';
  const { inside, door } = building;
  // Plain paving: its joints carry it.
  hand.fill(polysPath(unionRings([rectPoly(inside), ...(door ? [door.gap] : [])])), piece.use === 'crypt' ? 'dressed' : 'stone');
  const [unit, course] = piece.use === 'crypt' ? [0.6, 0.6] : glass ? [0.2, 0.1] : [0.24, 0.15];
  const lines: Vec[][] = [];
  for (let y = inside.y + course, row = 0; y < inside.y + inside.h - 0.02; y += course, row++) {
    lines.push([{ x: inside.x, y }, { x: inside.x + inside.w, y }]);
    for (let x = inside.x + (row % 2 ? unit / 2 : unit); x < inside.x + inside.w - 0.02; x += unit) lines.push([{ x, y: y - course }, { x, y }]);
  }
  hand.line(lines, 'fine');
  if (glass) drawBeds(hand, inside);
}

/** Beds of bare earth either side of a greenhouse's walk, darker than it, raked into furrows and edged in brick. */
function drawBeds(hand: Hand, inside: Outbuilding['inside']): void {
  const long = inside.w >= inside.h;
  for (const side of [-1, 1]) {
    const depth = (long ? inside.h : inside.w) * 0.32;
    const near = (from: number, size: number): number => (side < 0 ? from + 0.08 : from + size - 0.08 - depth);
    const bed = long ? { x: inside.x + 0.1, y: near(inside.y, inside.h), w: inside.w - 0.2, h: depth } : { x: near(inside.x, inside.w), y: inside.y + 0.1, w: depth, h: inside.h - 0.2 };
    const ring = rectPoly(bed);
    hand.surface(polysPath([ring]), 'floor');
    hand.tone(() => 0.4, pointsBounds(ring), polysPath([ring]), 'shade');
    const furrows = [1, 2, 3].map((k): Vec[] => (long ? [{ x: bed.x + 0.06, y: bed.y + (bed.h * k) / 4 }, { x: bed.x + bed.w - 0.06, y: bed.y + (bed.h * k) / 4 }] : [{ x: bed.x + (bed.w * k) / 4, y: bed.y + 0.06 }, { x: bed.x + (bed.w * k) / 4, y: bed.y + bed.h - 0.06 }]));
    hand.line(furrows, 'fine');
    hand.edges(ring, true);
  }
}

/** The shade on the open ground: the scene's shadows and occlusion, and the trees' soft shadows. */
export function drawGroundsShade(hand: Hand, paint: GroundsPaint, layout: GroundsLayout): void {
  const { scene } = hand;
  const { env } = scene;
  if (!env.view.shadow) return;
  const strength = env.style.shadow.strength * paint.shade.ground;
  const clip = polysPath(layout.open);
  hand.tone((x, y) => Math.min(0.85, (0.5 * scene.occlusionAt(x, y) ** 1.25 + 0.55 * scene.shadowAt(x, y)) * strength), pointsBounds(layout.lot), clip, 'shade');
  const crowns = [...layout.crowns.values()].flatMap((crown) => crown.rings);
  if (crowns.length) castShadow(hand, polysPath(crowns), 0.85, pointsBounds(crowns.flat()), paint.shade.tree, clip);
}
