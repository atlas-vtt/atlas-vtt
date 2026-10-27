/**
 * The grounds of a house as drawn (`DungeonFloor.grounds`, on its entrance floor): where each piece
 * lies, the drive with its turning circle, the open ground the house's and the garden walls' shadows
 * fall on, each tree's crown and each outbuilding's walls, and how tall what stands there is, worked
 * out once per floor and shared by both painters.
 */

import { cellsBox } from '../../geometry';
import type { DungeonFloor, GroundsKind, GroundsPiece, HouseGrounds } from '../../model';
import type { Stand } from '../art/heights';
import { polysPath, rectPoly, type PathFn } from '../art/paths';
import { subtractRings } from '../clipShapes';
import { cellsRings, type Vec } from '../geometry';
import { houseMass } from '../house/houseMass';
import { crownOf, type Crown } from './crowns';
import { wayShapes } from './wayLines';

/** How tall each standing piece of the grounds is, a house's wall being 1. */
export const GROUNDS_HEIGHT = { hedge: 0.75, boundary: 0.7, outbuilding: 1, greenhouse: 0.45 } as const;

/** An outbuilding's walls: masonry this thick inside the cells it stands on (a greenhouse's low base wall thinner). */
const OUTBUILDING_WALL = { solid: 0.26, greenhouse: 0.12 };

type Box = { x: number; y: number; w: number; h: number };

/** An outbuilding: its cells' box, its walls' thickness, the room inside them, its walls as rings and its doorway. */
export interface Outbuilding {
  box: Box;
  wall: number;
  inside: Box;
  walls: Vec[][];
  door: OutbuildingDoor | null;
}

/** An outbuilding's door: the gap in its wall a cell wide, and the door's frame (`u` across the gap, `v` inwards from the outer face). */
export interface OutbuildingDoor {
  gap: Vec[];
  mid: Vec;
  across: Vec;
  inward: Vec;
}

export interface GroundsLayout {
  /** The lot, as a box of cells and as an outline. */
  lotBox: Box;
  lot: Vec[];
  /** The pieces of each kind, in the model's order. */
  pieces: ReadonlyMap<GroundsKind, readonly GroundsPiece[]>;
  /** The open ground: the lot without the house, as rings. */
  open: Vec[][];
  /** The cells of the lawn and of the ways, for what is scattered over them. */
  lawnCells: readonly Vec[];
  wayCells: readonly Vec[];
  /** The drive and walks, as rings (`wayLines.ts`): the way in square, its turn round the fountain a ring, the walks rounded. */
  ways: Vec[][];
  crowns: ReadonlyMap<GroundsPiece, Crown>;
  outbuildings: ReadonlyMap<GroundsPiece, Outbuilding>;
}

const layouts = new WeakMap<DungeonFloor, GroundsLayout | null>();

/** A floor's grounds as drawn, worked out once; null where the floor has none or their lawn is not drawn. */
export function groundsLayout(floor: DungeonFloor): GroundsLayout | null {
  if (layouts.has(floor)) return layouts.get(floor)!;
  const grounds = floor.grounds;
  const layout = grounds?.pieces.some((piece) => piece.kind === 'garden') ? build(floor, grounds) : null;
  layouts.set(floor, layout);
  return layout;
}

function build(floor: DungeonFloor, grounds: HouseGrounds): GroundsLayout {
  const pieces = new Map<GroundsKind, GroundsPiece[]>();
  for (const piece of grounds.pieces) pieces.set(piece.kind, [...(pieces.get(piece.kind) ?? []), piece]);
  const of = (kind: GroundsKind): readonly GroundsPiece[] => pieces.get(kind) ?? [];
  const lot = rectPoly(grounds.lot);
  // Walks one cell wide in order are drawn along their line; the way in, the gates and wider walks as their cells lie.
  const walks = of('path').filter((piece) => isWalk(piece.cells));
  const formal = [...of('drive'), ...of('path').filter((piece) => !walks.includes(piece)), ...of('gate')].flatMap((piece) => piece.cells);
  const ways = wayShapes(formal, walks.map((piece) => piece.cells), of('garden-fountain')[0], grounds.lot.x * 7919 + grounds.lot.y * 104729);
  return {
    lotBox: grounds.lot,
    lot,
    pieces,
    open: subtractRings([lot], houseMass(floor)?.outline ?? []),
    lawnCells: of('garden').flatMap((piece) => piece.cells),
    wayCells: ways.cells,
    ways: ways.rings,
    crowns: new Map(of('tree').flatMap((tree) => (tree.at ? [[tree, crownOf(tree.at, tree.radius ?? 1)] as const] : []))),
    outbuildings: new Map(of('outbuilding').map((piece) => [piece, outbuildingOf(piece)] as const)),
  };
}

export function piecesOf(layout: GroundsLayout, kind: GroundsKind): readonly GroundsPiece[] {
  return layout.pieces.get(kind) ?? [];
}

/** Whether a walk's cells follow one another, each beside the last: a walk one cell wide, in order (a small house's way in may hold no cell). */
function isWalk(cells: readonly Vec[]): boolean {
  return cells.length > 0 && cells.every((c, i) => i === 0 || Math.abs(c.x - cells[i - 1]!.x) + Math.abs(c.y - cells[i - 1]!.y) === 1);
}

export function outbuildingOf(piece: GroundsPiece): Outbuilding {
  const wall = piece.use === 'greenhouse' ? OUTBUILDING_WALL.greenhouse : OUTBUILDING_WALL.solid;
  const box = cellsBox(piece.cells);
  const inside = { x: box.x + wall, y: box.y + wall, w: box.w - wall * 2, h: box.h - wall * 2 };
  const door = piece.door ? doorOf(piece.door, wall) : null;
  return { box, wall, inside, door, walls: subtractRings([rectPoly(box)], door ? [rectPoly(inside), door.gap] : [rectPoly(inside)]) };
}

/** The doorway on the edge between the door's outside cell and the building, across the whole wall. */
function doorOf(door: NonNullable<GroundsPiece['door']>, wall: number): OutbuildingDoor {
  const mid = { x: door.x + 0.5 + door.dir.x * 0.5, y: door.y + 0.5 + door.dir.y * 0.5 };
  const across = { x: -door.dir.y, y: door.dir.x };
  const corner = (s: number, d: number): Vec => ({ x: mid.x + across.x * 0.36 * s + door.dir.x * d, y: mid.y + across.y * 0.36 * s + door.dir.y * d });
  return { gap: [corner(-1, -0.02), corner(1, -0.02), corner(1, wall + 0.02), corner(-1, wall + 0.02)], mid, across, inward: door.dir };
}

/** The open ground round the house, where shadows fall as on a floor: the lot without the house. */
export function openGround(floor: DungeonFloor): PathFn | null {
  const layout = groundsLayout(floor);
  return layout && polysPath(layout.open);
}

/** What stands on the grounds, for the scene's shadows and occlusion. */
export function groundsStands(floor: DungeonFloor): Stand[] {
  const layout = groundsLayout(floor);
  if (!layout) return [];
  const cellsPath = (kind: GroundsKind): PathFn => polysPath(piecesOf(layout, kind).flatMap((piece) => cellsRings(piece.cells)));
  return [
    { height: GROUNDS_HEIGHT.hedge, path: cellsPath('hedge') },
    { height: GROUNDS_HEIGHT.boundary, path: cellsPath('boundary-wall') },
    ...[...layout.outbuildings].map(([piece, building]) => ({ height: piece.use === 'greenhouse' ? GROUNDS_HEIGHT.greenhouse : GROUNDS_HEIGHT.outbuilding, path: polysPath(building.walls) })),
  ];
}
