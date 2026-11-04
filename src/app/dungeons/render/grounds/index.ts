/**
 * A house's grounds, drawn once through a hand and a painter's `GroundsPaint` on the floor that
 * holds them, in three passes: what lies flat before the house is drawn over it, the shade on the
 * open ground after the scene's shade, and what stands, in the order it overlaps (trees last).
 */

import type { GroundsKind, GroundsPiece } from '../../model';
import type { Hand } from '../art/hand';
import { drawBoundaryWall, drawGate, drawHedge } from './boundary';
import { drawColumn, drawFountain, drawTree } from './garden';
import { drawGroundsGround, drawGroundsShade } from './ground';
import { groundsLayout, piecesOf, type GroundsLayout } from './groundsShapes';
import { drawOutbuilding } from './outbuildings';
import type { GroundsPaint } from './paint';

type Draw = (hand: Hand, paint: GroundsPaint, piece: GroundsPiece, layout: GroundsLayout) => void;

/** Kinds that lie flat, drawn whole by the ground pass: the lawn, the ways, and the floors of the porch and outbuildings. */
const FLAT: readonly GroundsKind[] = ['garden', 'path', 'drive', 'porch', 'outbuilding'];

/** What stands, in the order it is drawn. */
const STANDING: readonly [GroundsKind, Draw][] = [
  ['hedge', drawHedge],
  ['boundary-wall', (hand, _, piece) => drawBoundaryWall(hand, piece)],
  ['gate', (hand, _, piece) => drawGate(hand, piece)],
  ['outbuilding', (hand, paint, piece, layout) => drawOutbuilding(hand, paint, piece, layout.outbuildings.get(piece)!)],
  ['porch', (hand, _, piece) => piece.columns?.forEach((at) => drawColumn(hand, at))],
  ['garden-fountain', drawFountain],
  ['tree', (_, paint, piece, layout) => drawTree(paint, layout.crowns.get(piece)!)],
];

/** Every grounds kind with a drawing. */
export function drawnGroundsKinds(): GroundsKind[] {
  return [...new Set([...FLAT, ...STANDING.map(([kind]) => kind)])];
}

export interface GroundsPainter {
  ground(): void;
  shade(): void;
  standing(): void;
}

/** The grounds of the floor the hand draws, if it has any; `paint` is made only then. */
export function groundsPainter(hand: Hand, makePaint: () => GroundsPaint): GroundsPainter {
  const layout = groundsLayout(hand.scene.env.dungeon.floor);
  if (!layout) return { ground: () => undefined, shade: () => undefined, standing: () => undefined };
  const paint = makePaint();
  return {
    ground: () => drawGroundsGround(hand, paint, layout),
    shade: () => drawGroundsShade(hand, paint, layout),
    standing: () => {
      for (const [kind, draw] of STANDING) for (const piece of piecesOf(layout, kind)) draw(hand, paint, piece, layout);
    },
  };
}
