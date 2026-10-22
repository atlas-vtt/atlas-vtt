import { tokenDiameterInCells } from '../token-renderer/tokenSizing';

export interface Point {
  x: number;
  y: number;
}

/** The grid tokens in the GM's hand snap to; null where they are placed freely. */
export interface PlacementGrid {
  readonly hex: boolean;
  /** Side of a square, flat-to-flat width of a hex, in world pixels. */
  readonly cellSize: number;
  /** Where the centre of a token of `size` snaps near `point` (`GridSystem.snapTokenCenter`). */
  snapToken(point: Point, size: number): Point;
  /** The centre of the cell holding `point`. */
  cellCentre(point: Point): Point;
  /** The corners of the cell centred on `centre`. */
  cellOutline(centre: Point): Point[];
}

/** A token in the hand: where the spawn laid it out, and its size in cells. */
export interface HandToken {
  readonly home: Point;
  readonly size: number;
}

/** The middle of the box around the tokens' places: the point the pointer holds them by. */
export function handCentre(tokens: readonly HandToken[]): Point {
  if (tokens.length === 0) return { x: 0, y: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { home } of tokens) {
    minX = Math.min(minX, home.x);
    minY = Math.min(minY, home.y);
    maxX = Math.max(maxX, home.x);
    maxY = Math.max(maxY, home.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/**
 * Where the tokens stand when the pointer holds them at `pointer`: their layout moved as one, held
 * by its middle. On a grid the layout moves by whole cells, so it keeps its shape: one token is
 * snapped (the first with an odd footprint, whose places are the grid's own cells) and the others
 * follow it, each snapped again since an even footprint stands where cells meet.
 */
export function formationAt(tokens: readonly HandToken[], pointer: Point, grid: PlacementGrid | null): Point[] {
  const centre = handCentre(tokens);
  const lead = tokens.find((token) => cellDiameter(token.size) % 2 === 1) ?? tokens[0];
  if (!lead) return [];
  const wanted = { x: pointer.x + lead.home.x - centre.x, y: pointer.y + lead.home.y - centre.y };
  const placed = grid ? grid.snapToken(wanted, lead.size) : wanted;
  const dx = placed.x - lead.home.x;
  const dy = placed.y - lead.home.y;
  return tokens.map(({ home, size }) => {
    const moved = { x: home.x + dx, y: home.y + dy };
    return grid ? grid.snapToken(moved, size) : moved;
  });
}

/** Whole cells across a token's footprint: at least one, so a tiny token still lights its cell. */
function cellDiameter(size: number): number {
  return Math.max(1, Math.round(tokenDiameterInCells(size)));
}

/**
 * The centres of the cells a token of `size` covers when it stands at `centre`: an odd footprint
 * around its cell, an even one around the point where its cells meet (`tokenCenterShift`).
 */
export function footprintCells(centre: Point, size: number, grid: PlacementGrid): Point[] {
  const cells = cellDiameter(size);
  const reach = (cells / 2) * grid.cellSize;
  const tolerance = grid.cellSize * 0.01;
  const step = grid.cellSize / 2;
  const span = Math.ceil(reach / step) + 1;
  const found = new Map<string, Point>();
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      const cell = grid.cellCentre({ x: centre.x + i * step, y: centre.y + j * step });
      const key = `${Math.round(cell.x * 8)},${Math.round(cell.y * 8)}`;
      if (found.has(key)) continue;
      const dx = cell.x - centre.x;
      const dy = cell.y - centre.y;
      const inside = grid.hex
        ? Math.hypot(dx, dy) <= reach + tolerance
        : Math.abs(dx) < reach - tolerance && Math.abs(dy) < reach - tolerance;
      if (inside) found.set(key, cell);
    }
  }
  return [...found.values()];
}

/** How a token waiting in the queue is drawn: beside the token being placed, in screen pixels. */
export interface QueueSlot {
  /** From the centre of the token being placed to the waiting token's centre. */
  offset: Point;
  diameter: number;
  alpha: number;
}

/** How many waiting tokens the queue shows; the rest are counted beside the last. */
export const QUEUE_SHOWN = 3;

const QUEUE_DIAMETERS = [40, 32, 26] as const;
const QUEUE_ALPHAS = [0.95, 0.75, 0.55] as const;
const QUEUE_GAP = 6;
/** The queue starts below and to the right of the token being placed, like a trail it pulls. */
const QUEUE_ANGLE = (35 * Math.PI) / 180;

/**
 * Where the `index`th token after the one being placed waits: the first just off the lower right
 * of that token (`headRadius` in screen pixels), the others in a row to its right, each smaller and
 * fainter than the one before. Tokens past the row wait unseen behind its last place.
 */
export function queueSlot(index: number, headRadius: number): QueueSlot {
  const shown = Math.min(index, QUEUE_SHOWN - 1);
  const first = QUEUE_DIAMETERS[0];
  const reach = headRadius + QUEUE_GAP + first / 2;
  let x = Math.cos(QUEUE_ANGLE) * reach;
  for (let i = 1; i <= shown; i++) x += QUEUE_DIAMETERS[i - 1]! / 2 + QUEUE_GAP + QUEUE_DIAMETERS[i]! / 2;
  return {
    offset: { x, y: Math.sin(QUEUE_ANGLE) * reach },
    diameter: QUEUE_DIAMETERS[shown]!,
    alpha: index < QUEUE_SHOWN ? QUEUE_ALPHAS[shown]! : 0,
  };
}

/** Where the count of tokens the queue does not show stands: right of its last place. */
export function queueCountOffset(headRadius: number): Point {
  const last = queueSlot(QUEUE_SHOWN - 1, headRadius);
  return { x: last.offset.x + last.diameter / 2 + QUEUE_GAP, y: last.offset.y };
}

/** Turns snap to this many degrees, as the rotate handle does; Alt turns freely. */
const FACING_STEP = 15;

/**
 * The `rotation` of a token at `from` turned to look towards `to` (it looks towards its art's
 * bottom, `tokenFacing`): degrees from up, clockwise, in steps of 15° unless `free`.
 */
export function facingTowards(from: Point, to: Point, free: boolean): number {
  const degrees = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI - 180;
  const turned = free ? degrees : Math.round(degrees / FACING_STEP) * FACING_STEP;
  return ((turned % 360) + 360) % 360;
}

/** `items` turned `steps` places on: the first goes to the back for each step forward. */
export function cycled<T>(items: readonly T[], steps: number): T[] {
  if (items.length === 0) return [];
  const shift = ((steps % items.length) + items.length) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}
