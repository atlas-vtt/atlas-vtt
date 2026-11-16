/**
 * How a gardener lays a walk across a house's grounds (research: Repton's and Brown's drives, the
 * walks of a parterre): in long straight runs with few turns, leaving a door straight out from it,
 * and meeting another way square across it, never grazing it or running along beside it. A walk is
 * routed in cells, one wide; what is drawn rounds its turns (`render/grounds/wayLines.ts`).
 */

import { cellKey } from '../../geometry';
import type { CellDir, CellPoint } from '../../model';
import { MinHeap } from '../minHeap';
import { BUILDING, type LotGrid, TAKEN, WAY } from './groundsGrid';

/** The four steps, by index: up, right, down, left. */
export const STEPS: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** What a turn costs, in steps: a walk takes a few cells more to keep straight. */
const TURN = 3;
/** What a cell beside another way costs on top of its step: walks do not run along each other. */
const BESIDE_WAY = 2;
/** What a cell beside the lot's boundary or beside a building costs: a walk keeps off walls where it can. */
const BESIDE_WALL = 1;
/** Cells straight after every turn and from a walk's start, so each turn has room to be drawn round. */
const LEG = 2;

/** Where a walk may end: a cell it meets, entered by one of the steps in `steps` (a bit per index into `STEPS`). */
export interface Meeting {
  steps: number;
  /** Whether the cell is the walk's own last one (a door's outside cell), else it belongs to the way met. */
  inside: boolean;
}

/** Where a walk may start: a cell, the step it leaves by (an index into `STEPS`) and what starting there costs beyond the walk. */
export interface WalkStart {
  start: CellPoint;
  step: number;
  bias: number;
}

export interface WalkRequest {
  /** The lot: where a walk may go, the ways laid, and the buildings, off whose walls a walk keeps a cell but at its door. */
  grid: LotGrid;
  starts: readonly WalkStart[];
  meets: ReadonlyMap<string, Meeting>;
}

export interface Walk {
  /** The walk's cells in order from its start. */
  cells: CellPoint[];
  cost: number;
  /** The cell met, outside the walk where it belongs to a way. */
  met: CellPoint;
}

/**
 * The cheapest walk from any of `starts` to a meeting, and which start it left from, or null: one cell
 * wide, going `LEG` cells straight from its start and after every turn, entering the cell met straight
 * on, and never crossing itself.
 */
export function layWalk(request: WalkRequest): { walk: Walk; from: number } | null {
  const { grid, starts, meets } = request;
  const { lot } = grid;
  const size = lot.w * lot.h;
  const inLot = (x: number, y: number): boolean => x >= lot.x && y >= lot.y && x < lot.x + lot.w && y < lot.y + lot.h;
  // What each cell costs to step on (Infinity where taken), and what may be met there, read once per cell.
  const price = new Float32Array(size).fill(-1);
  const priceAt = (x: number, y: number, cell: number): number => {
    let p = price[cell]!;
    if (p < 0) {
      let beside = 0;
      for (const s of STEPS) {
        const i = grid.index(x + s.x, y + s.y);
        if (i >= 0) beside |= grid.at(i);
      }
      const edge = x === lot.x + 1 || y === lot.y + 1 || x === lot.x + lot.w - 2 || y === lot.y + lot.h - 2;
      p = grid.at(cell) & TAKEN ? Infinity : 1 + (beside & WAY ? BESIDE_WAY : 0) + (edge || beside & BUILDING ? BESIDE_WALL : 0);
      price[cell] = p;
    }
    return p;
  };
  // The steps each cell may be met by (bit 4: the cell is the walk's own), laid out once.
  const meetAt = new Uint8Array(size);
  for (const [key, meeting] of meets) {
    const [mx, my] = key.split(',').map(Number) as [number, number];
    if (inLot(mx, my)) meetAt[(my - lot.y) * lot.w + (mx - lot.x)] = meeting.steps | (meeting.inside ? 16 : 0);
  }
  // How far each cell lies from the nearest cell met, counted in steps through anything (two sweeps): a step
  // costs at least one, so the search goes towards the meetings first and still finds the cheapest walk.
  const toward = new Float32Array(size).fill(Infinity);
  for (let c = 0; c < size; c++) if (meetAt[c]) toward[c] = 0;
  for (let c = 0; c < size; c++) {
    if (c % lot.w > 0) toward[c] = Math.min(toward[c]!, toward[c - 1]! + 1);
    if (c >= lot.w) toward[c] = Math.min(toward[c]!, toward[c - lot.w]! + 1);
  }
  for (let c = size - 1; c >= 0; c--) {
    if (c % lot.w < lot.w - 1) toward[c] = Math.min(toward[c]!, toward[c + 1]! + 1);
    if (c + lot.w < size) toward[c] = Math.min(toward[c]!, toward[c + lot.w]! + 1);
  }
  // A state is a cell, the step that entered it and whether it may turn yet.
  const best = new Float64Array(size * 8).fill(Infinity);
  const back = new Int32Array(size * 8).fill(-1);
  const heap = new MinHeap<number>();
  starts.forEach(({ start, step, bias }) => {
    if (!inLot(start.x, start.y)) return;
    const state = ((start.y - lot.y) * lot.w + (start.x - lot.x)) * 8 + step * 2 + 1;
    if (bias >= best[state]!) return;
    best[state] = bias;
    heap.push(state, bias + toward[state >> 3]!);
  });
  for (let next = heap.pop(); next; next = heap.pop()) {
    const state = next.item;
    const cost = best[state]!;
    if (next.cost > cost + toward[state >> 3]!) continue;
    const held = state & 1;
    const step = (state >> 1) & 3;
    const cell = state >> 3;
    const x = lot.x + (cell % lot.w);
    const y = lot.y + Math.floor(cell / lot.w);
    for (const turn of [0, 1, 3]) {
      if (turn !== 0 && held) continue;
      const s = (step + turn) % 4;
      const nx = x + STEPS[s]!.x;
      const ny = y + STEPS[s]!.y;
      if (!inLot(nx, ny)) continue;
      const nextCell = (ny - lot.y) * lot.w + (nx - lot.x);
      const meeting = turn === 0 ? meetAt[nextCell]! : 0;
      if (meeting & (1 << s)) {
        const walk = walkTo(state, { x: nx, y: ny }, (meeting & 16) !== 0, cost + 1);
        if (walk) return walk;
        continue;
      }
      const stepCost = priceAt(nx, ny, nextCell);
      if (stepCost === Infinity) continue;
      const nextState = nextCell * 8 + s * 2 + (turn === 0 ? 0 : LEG - 1);
      const nextCost = cost + stepCost + (turn === 0 ? 0 : TURN);
      if (nextCost >= best[nextState]!) continue;
      best[nextState] = nextCost;
      back[nextState] = state;
      heap.push(nextState, nextCost + toward[nextCell]!);
    }
  }
  return null;

  /** The walk that ends at `last`, or null where it crosses itself (a loop standing in for a turn about). */
  function walkTo(last: number, met: CellPoint, inside: boolean, cost: number): { walk: Walk; from: number } | null {
    const cells: CellPoint[] = inside ? [met] : [];
    let first = last;
    for (let s = last; s !== -1; s = back[s]!) {
      const cell = s >> 3;
      cells.push({ x: lot.x + (cell % lot.w), y: lot.y + Math.floor(cell / lot.w) });
      first = s;
    }
    if (new Set(cells.map((c) => cellKey(c.x, c.y))).size !== cells.length) return null;
    cells.reverse();
    const from = starts.findIndex(({ start, step }) => start.x === cells[0]!.x && start.y === cells[0]!.y && step === ((first >> 1) & 3));
    return { walk: { cells, cost, met }, from };
  }
}

/** The step index of `dir`. */
export function stepOf(dir: { x: number; y: number }): number {
  return STEPS.findIndex((s) => s.x === dir.x && s.y === dir.y);
}

/** The steps across a way that runs along `dir` (either way along it is the same), as a meeting's bits. */
export function across(dir: { x: number; y: number }): number {
  return dir.x === 0 ? (1 << 1) | (1 << 3) : (1 << 0) | (1 << 2);
}

/** How many cells from either end of a walk another may meet it: never right before a door or a junction. */
const CLEAR_OF_ENDS = 3;

/**
 * Where a walk may meet a walk already laid (`cells` in order): square across it, where it runs
 * straight for two cells either side, clear of its ends, so the meeting never lands on a turn or by a door.
 */
export function walkMeetings(cells: readonly CellPoint[], meets: Map<string, Meeting>): void {
  for (let i = CLEAR_OF_ENDS; i + CLEAR_OF_ENDS < cells.length; i++) {
    const dx = cells[i + 1]!.x - cells[i]!.x;
    const dy = cells[i + 1]!.y - cells[i]!.y;
    let line = true;
    for (let k = i - 2; k < i + 2; k++) line &&= cells[k + 1]!.x - cells[k]!.x === dx && cells[k + 1]!.y - cells[k]!.y === dy;
    if (line) meets.set(cellKey(cells[i]!.x, cells[i]!.y), { steps: across({ x: dx, y: dy }), inside: false });
  }
}
