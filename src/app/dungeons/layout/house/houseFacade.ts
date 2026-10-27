/**
 * A house's facades (report 2026-10-25-mansion-windows-research): the lines of its ground floor's
 * outer walls, each divided into bays, the cells where a window may stand, one every `period`
 * cells. The same bays serve every floor, so windows stand over windows. A front that crosses the
 * axis of a symmetric house, or holds an entrance, counts its bays from the door outwards, so they
 * mirror about it and one stands over the door; any other line has its bays about its own middle,
 * and in a symmetric house the lines east of the axis take the mirror of their twin's.
 */

import type { CellDir, DungeonDoor } from '../../model';
import { dir, doorCells } from '../../geometry';
import { type Rng, chance } from '../../rng';
import { SIDES } from './houseEdges';

/** How many cells apart a house's side and back walls have their bays: two or three. */
export function facadePeriod(rng: Rng): number {
  const period = chance(rng, 0.5) ? 2 : 3;
  // A draw that once chose the grid's phase, kept so the rest of the house stays the same.
  rng();
  return period;
}

/** The edges of a floor's entrances, from the cell inside, the way out. */
export function entranceEdges(doors: readonly DungeonDoor[]): Edge[][] {
  return doors.filter((d) => d.from === null).map((d) => doorCells(d).map((c) => ({ x: c.x + d.dir.x, y: c.y + d.dir.y, dir: dir(-d.dir.x, -d.dir.y) })));
}

/** An edge of a cell: the cell, and the way out of it. */
export interface Edge {
  x: number;
  y: number;
  dir: CellDir;
}

interface FacadeLine {
  dir: CellDir;
  /** Whether the line crosses the axis of a symmetric house, so its bays mirror about it. */
  onAxis: boolean;
  /** The line's place across the wall (`y` of a horizontal wall, `x` of a vertical one), and its first and last cell along it. */
  at: number;
  from: number;
  to: number;
  bay: (u: number) => boolean;
}

export interface Facade {
  /** Whether a window on `edge` stands in a bay of the facade it faces. */
  isBay(edge: Edge): boolean;
  /** Whether `edge` lies on a line whose bays mirror about the axis of a symmetric house. */
  onAxis(edge: Edge): boolean;
  /** Whether `edge` stands over (or on) an entrance of the ground floor, whatever the row of its floor's wall. */
  overEntrance(edge: Edge): boolean;
}

/** A front that holds an entrance or mirrors about the axis has a bay every two cells, a window to a pier, as a Georgian front has. */
const FRONT_PERIOD = 2;

const acrossOf = (e: Edge): number => (e.dir.y !== 0 ? e.y : e.x);
export const alongEdge = (e: Edge): number => (e.dir.y !== 0 ? e.x : e.y);

/**
 * Bays every `period` cells counted outwards from a door or axis whose cells' doubled middle is
 * `centre2`. An axis between two cells has a bay on either side of it only where an entrance stands
 * there (`entrance`), a pair over a double door: anywhere else two windows would touch.
 */
function fromCentre(centre2: number, period: number, entrance: (u: number) => boolean): (u: number) => boolean {
  const odd = ((centre2 % 2) + 2) % 2;
  return (u) => {
    const d = Math.abs(2 * u - centre2);
    return (d - odd) % (2 * period) === 0 && (d !== 1 || entrance(u));
  };
}

/** Bays every `period` cells between a line's corner cells, as near its middle as whole cells allow. */
function fromMiddle(from: number, to: number, period: number): (u: number) => boolean {
  const inner = to - from - 1;
  const first = from + 1 + Math.floor(((inner - 1) % period) / 2);
  return (u) => inner > 0 && u >= first && u < to && (u - first) % period === 0;
}

export interface FacadeInput {
  frame: { width: number; symmetric: boolean };
  /** Whether a cell lies inside the house on its ground floor. */
  inHouse: (x: number, y: number) => boolean;
  /** Every cell of the ground floor's rooms. */
  cells: readonly { x: number; y: number }[];
  /** The ground floor's entrances: their inside cells and the way out. */
  entrances: readonly Edge[][];
  period: number;
}

const sameDir = (a: CellDir, b: CellDir): boolean => a.x === b.x && a.y === b.y;
/** Whether an entrance edge stands on `line`. */
const onLine = (c: Edge, line: Omit<FacadeLine, 'bay'>): boolean => sameDir(c.dir, line.dir) && acrossOf(c) === line.at && alongEdge(c) >= line.from && alongEdge(c) <= line.to;

export function houseFacade(input: FacadeInput): Facade {
  const { frame, inHouse } = input;
  const axis2 = frame.width - 1;
  const lines: FacadeLine[] = [];
  for (const side of SIDES) {
    const byLine = new Map<number, number[]>();
    for (const c of input.cells) {
      if (inHouse(c.x + side.x, c.y + side.y)) continue;
      const e = { ...c, dir: side };
      const list = byLine.get(acrossOf(e)) ?? [];
      list.push(alongEdge(e));
      byLine.set(acrossOf(e), list);
    }
    for (const [at, us] of byLine) {
      const sorted = [...new Set(us)].sort((a, b) => a - b);
      let from = sorted[0]!;
      for (let k = 1; k <= sorted.length; k++) {
        if (k < sorted.length && sorted[k] === sorted[k - 1]! + 1) continue;
        const line = { dir: side, at, from, to: sorted[k - 1]!, onAxis: frame.symmetric && side.y !== 0 && 2 * from <= axis2 && 2 * sorted[k - 1]! >= axis2 };
        lines.push({ ...line, bay: baysOf(line, input, axis2) });
        from = sorted[k]!;
      }
    }
  }
  const lineOf = (e: Edge): FacadeLine | undefined => {
    const u = alongEdge(e);
    let best: FacadeLine | undefined;
    for (const l of lines) if (sameDir(l.dir, e.dir) && u >= l.from && u <= l.to && (!best || Math.abs(l.at - acrossOf(e)) < Math.abs(best.at - acrossOf(e)))) best = l;
    return best;
  };
  return {
    isBay: (e) => lineOf(e)?.bay(alongEdge(e)) ?? false,
    overEntrance: (e) => input.entrances.some((cells) => cells.some((c) => sameDir(c.dir, e.dir) && alongEdge(c) === alongEdge(e))),
    onAxis: (e) => lineOf(e)?.onAxis ?? false,
  };
}

function baysOf(line: Omit<FacadeLine, 'bay'>, input: FacadeInput, axis2: number): (u: number) => boolean {
  const { period } = input;
  // An axis or entrance between two cells has its pair of bays only where a door stands there.
  const entrance = (u: number): boolean => input.entrances.some((cells) => cells.some((c) => onLine(c, line) && alongEdge(c) === u));
  if (line.onAxis) return fromCentre(axis2, FRONT_PERIOD, entrance);
  if (line.dir.y !== 0 && input.frame.symmetric && 2 * line.from > axis2) {
    // East of the axis a line takes its western twin's bays, mirrored.
    const twin = fromMiddle(axis2 - line.to, axis2 - line.from, period);
    return (u) => twin(axis2 - u);
  }
  const door = input.frame.symmetric && line.dir.y !== 0 ? undefined : input.entrances.find((cells) => cells.every((c) => onLine(c, line)));
  if (door) return fromCentre(alongEdge(door[0]!) + alongEdge(door[door.length - 1]!), FRONT_PERIOD, entrance);
  return fromMiddle(line.from, line.to, period);
}
