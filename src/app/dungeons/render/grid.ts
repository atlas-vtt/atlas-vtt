import { cellsBox, doorCells } from '../geometry';
import { doorEdge } from './houseShapes';
import type { DungeonDoor, DungeonRoom } from '../model';
import type { Rng } from '../rng';
import { clipToFloors } from './floors';
import { floorRing, type WayOut } from './cave/mouth/wayOut';
import { pointsBounds, type Bounds, type Vec } from './geometry';
import { polysPath } from './art/paths';
import { groundsLayout } from './grounds/groundsShapes';
import { strokeWidth, type RenderEnv } from './renderEnv';

type Line = [Vec, Vec];

/**
 * The grid inside the floors: interior cell lines of every room (chords in a rotunda), the
 * lines where an open passage meets its rooms, and a cave's ways out as far as they read as floor,
 * in the view's style; and on a house's open ground.
 */
export function drawGrid(env: RenderEnv): void {
  const { view } = env;
  if (view.grid === 'off') return;
  const step = view.smallTiles ? 0.5 : 1;
  const lines: Line[] = [];
  for (const room of env.dungeon.rooms) lines.push(...roomLines(room, step));
  for (const door of env.dungeon.doors) lines.push(...doorLines(door, env.dungeon.wide));
  // A cave's way out is floor as far as it is drawn as floor: its cells carry the grid there. A Forest draws none (`drawForest`).
  const ways = env.dungeon.floor.forest ? [] : env.dungeon.ways;
  const wayRings = ways.map(way => floorRing(env.dungeon.field, way));
  ways.forEach((way, k) => lines.push(...wayLines(way, pointsBounds(wayRings[k]!), step)));
  strokeGrid(env, lines, step, env.rng('grid'), () => clipToFloors(env, wayRings));
  // A house's grounds are walked on as its floors are: the lawn and its ways take the grid too.
  const grounds = groundsLayout(env.dungeon.floor);
  if (grounds) {
    strokeGrid(env, boxLines(grounds.lotBox, step), step, env.rng('grounds-grid'), () => {
      env.ctx.beginPath();
      polysPath(grounds.open)(env.ctx);
      env.ctx.clip();
    });
  }
}

/** Strokes grid lines in the view's style, inside the clip `clip` sets. */
function strokeGrid(env: RenderEnv, lines: readonly Line[], step: number, rng: Rng, clip: () => void): void {
  const { view, ctx, palette, style } = env;
  ctx.save();
  clip();
  ctx.strokeStyle = palette.grid;
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeWidth(env, view.grid === 'dotted' && !view.smallTiles ? style.strokes.normal : style.strokes.thin) * style.grid.weight;
  ctx.beginPath();
  if (view.grid === 'dotted') {
    // Round dots, one on every crossing and evenly between, drawn as near-zero dashes with round caps.
    const dot = env.px * 0.75 * style.grid.weight;
    const period = step / (view.smallTiles ? 3 : 5);
    ctx.setLineDash([dot, period - dot]);
    ctx.lineDashOffset = dot / 2;
    for (const [a, b] of lines) traceLine(ctx, a, b);
  } else if (view.grid === 'solid') {
    for (const [a, b] of lines) traceLine(ctx, a, b);
  } else if (view.grid === 'dashed') {
    for (const [a, b] of lines) traceDashedCells(ctx, a, b, step, rng);
  } else {
    for (const [a, b] of lines) traceBroken(ctx, a, b, env.px, rng);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * The grid lines over a way out's box beyond its mouth, on whole cells (half cells with small
 * tiles): the line on the mouth's own edge, and from there out, never back over the floor's own.
 */
function wayLines(way: WayOut, b: Bounds, step: number): Line[] {
  const { at, out } = way.mouth;
  const box = {
    minX: out.x > 0 ? at.x : Math.floor(b.minX / step) * step,
    maxX: out.x < 0 ? at.x : Math.ceil(b.maxX / step) * step,
    minY: out.y > 0 ? at.y : Math.floor(b.minY / step) * step,
    maxY: out.y < 0 ? at.y : Math.ceil(b.maxY / step) * step,
  };
  const lines: Line[] = [];
  for (let x = Math.ceil(box.minX / step - 1e-9) * step; x <= box.maxX + 1e-9; x += step) lines.push([{ x, y: box.minY }, { x, y: box.maxY }]);
  for (let y = Math.ceil(box.minY / step - 1e-9) * step; y <= box.maxY + 1e-9; y += step) lines.push([{ x: box.minX, y }, { x: box.maxX, y }]);
  return lines;
}

function traceLine(ctx: CanvasPath, a: Vec, b: Vec): void {
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
}

type Box = { x: number; y: number; w: number; h: number };

/** A room's box: its rectangle, or round a cave room's cells. */
function boxOf(room: DungeonRoom): Box {
  return room.cells?.length ? cellsBox(room.cells) : room;
}

/** Interior lines of a room's box; the floor clip turns them into chords in a rotunda and keeps a cave's to its cells. */
function roomLines(room: DungeonRoom, step: number): Line[] {
  return boxLines(boxOf(room), step);
}

/** The lines between the cells of a box, `step` apart. */
function boxLines(box: Box, step: number): Line[] {
  const lines: Line[] = [];
  for (let x = box.x + step; x < box.x + box.w - 1e-9; x += step) lines.push([{ x, y: box.y }, { x, y: box.y + box.h }]);
  for (let y = box.y + step; y < box.y + box.h - 1e-9; y += step) lines.push([{ x: box.x, y }, { x: box.x + box.w, y }]);
  return lines;
}

/** A wide opening is floor: the lines where it meets its rooms are drawn as grid. */
function doorLines(door: DungeonDoor, wide: ReadonlySet<DungeonDoor>): Line[] {
  if (!wide.has(door)) return [];
  // An opening on an edge is no cell: the grid runs along its edge.
  if (door.edge) return [doorEdge(door)];
  const across = doorCells(door).flatMap(cell => {
    if (door.dir.x !== 0) return [cell.x, cell.x + 1].map(x => [{ x, y: cell.y }, { x, y: cell.y + 1 }] as Line);
    return [cell.y, cell.y + 1].map(y => [{ x: cell.x, y }, { x: cell.x + 1, y }] as Line);
  });
  if (!door.wide) return across;
  // The line between an opening's two cells, along the way through.
  const mid = { x: door.x + Math.max(0, door.wide.x), y: door.y + Math.max(0, door.wide.y) };
  return [...across, door.wide.x !== 0 ? [{ x: mid.x, y: door.y }, { x: mid.x, y: door.y + 1 }] : [{ x: door.x, y: mid.y }, { x: door.x + 1, y: mid.y }]];
}

/** One dash in the middle of every cell edge, leaving 10 to 30 % at each corner. */
function traceDashedCells(ctx: CanvasPath, a: Vec, b: Vec, step: number, rng: Rng): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  for (let t = 0; t < length - 1e-9; t += step) {
    const end = Math.min(length, t + step);
    const span = end - t;
    const g0 = (0.1 + rng() * 0.2) * step;
    const g1 = (0.1 + rng() * 0.2) * step;
    if (span <= g0 + g1) continue;
    traceLine(ctx, { x: a.x + dx * (t + g0), y: a.y + dy * (t + g0) }, { x: a.x + dx * (end - g1), y: a.y + dy * (end - g1) });
  }
}

/** Hand-drawn: resampled every 10 px, wobbled by up to 1.25 px, broken into dashes of random length. */
function traceBroken(ctx: CanvasPath, a: Vec, b: Vec, px: number, rng: Rng): void {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  const sample = 10 * px;
  const wobble = 1.25 * px;
  const at = (t: number): Vec => {
    const w = (rng() * 2 - 1) * wobble;
    return { x: a.x + dx * t - dy * w, y: a.y + dy * t + dx * w };
  };
  let t = rng() * 0.1;
  while (t < length) {
    const on = 0.25 + rng() * 0.9;
    const end = Math.min(length, t + on);
    const start = at(t);
    ctx.moveTo(start.x, start.y);
    for (let s = t + sample; s < end; s += sample) {
      const p = at(s);
      ctx.lineTo(p.x, p.y);
    }
    const last = at(end);
    ctx.lineTo(last.x, last.y);
    t = end + 0.04 + rng() * 0.14;
  }
}
