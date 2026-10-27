import type { WallChannel, WallSegment } from '../types/wallTypes';

/** A wall's centre line: x1, y1, x2, y2 in world pixels. */
export type Seg = readonly [number, number, number, number];

/** A world rectangle: x, y, width, height in world pixels. */
export type Rect = readonly [x: number, y: number, width: number, height: number];

export function segOf(wall: WallSegment): Seg {
  return [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y];
}

export function distToSeg(x: number, y: number, [ax, ay, bx, by]: Seg): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-9)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}

/** Whether moving from p to q crosses segment s; leaving a segment one stands on does not count. */
export function crosses(px: number, py: number, qx: number, qy: number, [ax, ay, bx, by]: Seg): boolean {
  const rx = qx - px, ry = qy - py, sx = bx - ax, sy = by - ay;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((ax - px) * sy - (ay - py) * sx) / den;
  const u = ((ax - px) * ry - (ay - py) * rx) / den;
  return t > 1e-6 && t <= 1 && u >= 0 && u <= 1;
}

/** Whether `wall` is a wall for `channel`: one that blocks a single thing is none for the other. */
export function concerns(wall: WallSegment, channel: WallChannel): boolean {
  return wall.blocks === undefined || wall.blocks === channel;
}

/** What the parts of a wall that is cut up keep of it (a door placed in it, and what is left on either side): its chain, its direction, what it blocks, limited or not. */
export function keptByParts(wall: WallSegment): Pick<WallSegment, 'chainId' | 'direction' | 'blocks' | 'limited'> {
  return {
    ...(wall.chainId !== undefined && { chainId: wall.chainId }),
    ...(wall.direction !== undefined && { direction: wall.direction }),
    ...(wall.blocks !== undefined && { blocks: wall.blocks }),
    ...(wall.limited === true && { limited: true }),
  };
}

/** Open doors and walls shrunk to a point stop nothing, not even a token. */
export function stopsNothing(wall: WallSegment): boolean {
  const openDoor = (wall.type === 'door' || wall.type === 'secret-door') && !(wall.closed ?? true);
  return openDoor || (wall.p1.x === wall.p2.x && wall.p1.y === wall.p2.y);
}

/** Walls that block neither sight nor light: open doors, walls shrunk to a point, and windows (`blocks: 'movement'`), which stop a token alone. */
export function blocksNothing(wall: WallSegment): boolean {
  return wall.blocks === 'movement' || stopsNothing(wall);
}

export interface BlockingWalls {
  twoWay: Seg[];
  oneWay: WallSegment[];
  /** Limited walls (`WallSegment.limited`), one-way ones too: no trace through a field can count them. */
  limited: WallSegment[];
}

/**
 * The walls that block `channel` (without one, every wall that blocks anything: whoever names
 * no channel is stopped by all of them): two-way ones as segments for the shared field, one-way
 * ones kept whole because whether they block depends on where the light is, and limited ones
 * apart, because they stop only what has crossed another already.
 */
export function splitBlocking(walls: readonly WallSegment[], channel?: WallChannel): BlockingWalls {
  const twoWay: Seg[] = [];
  const oneWay: WallSegment[] = [];
  const limited: WallSegment[] = [];
  for (const wall of walls) {
    if (blocksNothing(wall) || (channel && !concerns(wall, channel))) continue;
    if (wall.limited) limited.push(wall);
    else if (wall.direction) oneWay.push(wall);
    else twoWay.push(segOf(wall));
  }
  return { twoWay, oneWay, limited };
}

/** The walls that stop everything, as segments: one-way walls as blocking both ways, limited walls left out. */
export function solidSegments({ twoWay, oneWay }: BlockingWalls): Seg[] {
  return [...twoWay, ...oneWay.map(segOf)];
}

/** Every blocking wall as a segment, for what treats one-way and limited walls as walls like any other. */
export function allSegments(blocking: BlockingWalls): Seg[] {
  return [...solidSegments(blocking), ...blocking.limited.map(segOf)];
}
