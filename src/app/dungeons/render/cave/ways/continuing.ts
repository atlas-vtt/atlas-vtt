import { floorCellsOf } from '../../../geometry';
import type { CellDir, CellPoint, DungeonRoom } from '../../../model';
import type { Hand } from '../../art/hand';
import { polyPath } from '../../art/paths';
import type { Vec } from '../../geometry';
import { dashes } from './shaftMouth';
import { clipped, clipToRock, zigzag } from './wayDoors';

/** Where the squeeze begins, from its rim cell's middle towards the rock: inside the floor, which the clip leaves out. */
const START = 0.3;
/** How far into the rock it runs before it closes, in cells. */
const LENGTH = 1.3;
/** Its width where it leaves the floor. */
const MOUTH = 0.36;

/**
 * The rim cell a chamber's continuing squeeze leaves from: of its floor cells furthest towards
 * `dir`, the middle one across that side, so the mark stands where the wall faces that way.
 */
export function continuingCell(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>, dir: CellDir): CellPoint | null {
  const cells = floorCellsOf(room);
  if (!cells.length) return null;
  const reach = (c: CellPoint): number => c.x * dir.x + c.y * dir.y;
  const far = Math.max(...cells.map(reach));
  const rim = cells.filter(c => reach(c) === far).sort((a, b) => (a.x * -dir.y + a.y * dir.x) - (b.x * -dir.y + b.y * dir.x));
  return rim[Math.floor((rim.length - 1) / 2)] ?? null;
}

/**
 * A squeeze that leads on, too tight to follow, from a chamber that would otherwise end blind: a
 * sliver of floor running into the rock past the wall and closing to nothing, its sides the
 * squeeze's zig-zag, solid where it leaves the wall and broken as it fades. The wall stays whole:
 * nobody passes it.
 */
export function drawContinuing(hand: Hand): void {
  const sides: Vec[][] = [];
  const slivers: Vec[][] = [];
  for (const room of hand.scene.env.dungeon.rooms) {
    const dir = room.continuing;
    const cell = dir && continuingCell(room, dir);
    if (!dir || !cell) continue;
    const at = (u: number, v: number): Vec => ({ x: cell.x + 0.5 - dir.y * u + dir.x * v, y: cell.y + 0.5 + dir.x * u + dir.y * v });
    const end = at(0, START + LENGTH);
    const left = zigzag(at(-MOUTH / 2, START), end, 3, 0.035);
    const right = zigzag(at(MOUTH / 2, START), end, 3, 0.035);
    slivers.push([...left, ...[...right].reverse()]);
    sides.push(left, right);
  }
  if (!slivers.length) return;
  clipped(hand, clipToRock, () => {
    for (const sliver of slivers) hand.fill(polyPath(sliver), 'floor');
    for (const side of sides) {
      const half = Math.ceil(side.length / 2);
      hand.line([side.slice(0, half + 1)], 'outline');
      hand.line(dashes(side.slice(half), 0.07, 0.07, false), 'fine');
    }
  });
}
