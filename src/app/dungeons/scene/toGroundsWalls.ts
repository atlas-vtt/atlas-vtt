/**
 * The walls of a house's grounds (Fabian's decisions 1 and 2): the boundary wall stops everything, a
 * hedge stops a token and sight but lets light through, the gate is a closed door across its gap,
 * and an outbuilding is walled round with a door on its door's edge. Only pieces the model holds,
 * which are those with a drawing (`DRAWN_GROUNDS_KINDS`).
 */

import type { WallSegment } from '../../types/wallTypes';
import { cellsBox } from '../geometry';
import { cellsShapes } from '../render/geometry';
import { doorEdge } from '../render/houseShapes';
import type { GroundsPiece, HouseGrounds } from '../model';
import type { DungeonPlacement, WallsOf } from './toWalls';

type Point = { x: number; y: number };

export function groundsWalls(grounds: HouseGrounds | undefined, placement: DungeonPlacement, of: WallsOf): Record<string, WallSegment> {
  const walls: Record<string, WallSegment> = {};
  if (!grounds) return walls;
  const { originCell, pxPerCell } = placement;
  const world = (p: Point): Point => ({ x: (p.x - originCell.x) * pxPerCell, y: (p.y - originCell.y) * pxPerCell });
  let count = 0;
  const add = (a: Point, b: Point, rest: Partial<WallSegment>): void => {
    const id = `wall_${of.id}_grounds_${++count}`;
    walls[id] = { id, kind: 'wall', type: 'solid', p1: world(a), p2: world(b), ...rest, ...(of.levels && { levels: of.levels }) };
  };
  const outline = (piece: GroundsPiece, rest: Partial<WallSegment>): void => {
    cellsShapes(piece.cells).forEach((shape, k) => {
      for (const ring of shape.rings) {
        ring.forEach((a, i) => {
          const b = ring[(i + 1) % ring.length]!;
          add(a, b, { chainId: `chain_${of.id}_grounds_${count}_${k}`, ...rest });
        });
      }
    });
  };
  for (const piece of grounds.pieces) {
    if (piece.kind === 'boundary-wall') outline(piece, {});
    else if (piece.kind === 'hedge') outline(piece, { blocks: 'sight' });
    else if (piece.kind === 'gate' && piece.dir) {
      const b = cellsBox(piece.cells);
      const [x0, x1, y0, y1] = [b.x, b.x + b.w, b.y, b.y + b.h];
      const across = piece.dir.y !== 0 ? [{ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 }] : [{ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 }];
      add(across[0]!, across[1]!, { type: 'door', closed: true });
    } else if (piece.kind === 'outbuilding' && piece.door) {
      for (const [a, b, kind] of outbuildingSides(piece.cells, piece.door)) add(a, b, kind === 'door' ? { type: 'door', closed: true } : {});
    }
  }
  return walls;
}

/** An outbuilding's walls round its cells, the side its door is on broken by the door: `[from, to, wall or door]`. */
function outbuildingSides(cells: readonly Point[], door: NonNullable<GroundsPiece['door']>): [Point, Point, 'wall' | 'door'][] {
  const b = cellsBox(cells);
  const [x0, x1, y0, y1] = [b.x, b.x + b.w, b.y, b.y + b.h];
  const corners = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  // The door's edge lies between its outside cell and the building, across `dir`.
  const gap = doorEdge(door);
  const out: [Point, Point, 'wall' | 'door'][] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % 4]!;
    const along = (p: Point): boolean => (a.x === b.x ? p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y) : p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x));
    if (!along(gap[0]) || !along(gap[1])) return void out.push([a, b, 'wall']);
    const [g0, g1] = Math.hypot(gap[0].x - a.x, gap[0].y - a.y) < Math.hypot(gap[1].x - a.x, gap[1].y - a.y) ? gap : [gap[1], gap[0]];
    out.push([a, g0, 'wall'], [g0, g1, 'door'], [g1, b, 'wall']);
  });
  return out.filter(([a, b]) => a.x !== b.x || a.y !== b.y);
}
