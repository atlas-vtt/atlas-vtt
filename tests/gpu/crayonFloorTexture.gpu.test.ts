import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { parseHex } from '../../src/app/dungeons/render/palette';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { vellumColours } from '../../src/app/dungeons/render/vellum';
import { visibleDungeon, type VisibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { groundsLayout } from '../../src/app/dungeons/render/grounds/groundsShapes';
import { wayCentre, wayPoint, wayStrength } from '../../src/app/dungeons/render/cave/mouth/wayOut';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';

/**
 * Crayon colours in every floor (`render/crayon/floors.ts`, `ground.ts`): no open floor cell of any
 * theme is left the bare paper. Each map is drawn whole; every cell of floor that nothing stands on,
 * away from walls, is read over its middle (clear of the grid's lines), and counts as coloured
 * when most of its pixels lie off the vellum's colour by more than its grain, and its strokes vary.
 * The narrow places are read too, each over a small window at its middle, clear of the walls' ink
 * and their shade: one-cell corridors, open doorways, a cave's ways out and a house's lawn.
 */

const PX = 48;
/** How far off the vellum a pixel must lie to be crayon, in RGB distance: the vellum's own grain and blotches stay well under it. */
const OFF_PAPER = 14;
/** The share of a cell's pixels off the paper for it to count as coloured. */
const COVERED = 0.6;
/**
 * Luminance spread a hand's strokes leave in a cell. Bare paper with pencilled joints reads 0.4 to
 * about 2.5 and a flat fill 0; coloured-in floors read 5 to 13, as the forest's meadow does (6 to 13).
 */
const STROKES = 4;

const CASES: [string, DungeonRequest, string[]][] = [
  ['fortress', { seed: 404, theme: 'fortress', tags: ['round', 'colonnades'], floors: 2 }, ['doorway']],
  ['cavern', { seed: 606, theme: 'cavern', tags: ['medium', 'wet'], floors: 2 }, ['corridor', 'way out']],
  ['mansion', { seed: 16, theme: 'mansion', tags: [], floors: 2 }, ['corridor', 'doorway', 'lawn']],
  ['mansion with cellar', { seed: 2, theme: 'mansion', tags: ['large'], floors: 3 }, ['lawn']],
  ['forest', { seed: 606, theme: 'forest', tags: ['medium', 'dry'], floors: 1 }, []],
];

/** A narrow place's window, in cells, and the least it is from a wall's line. */
const WINDOW = 0.3;
const CLEAR = 0.3;
/** The spread a window of hand strokes keeps: bare paper reads 0 to 2.9 there (beside a door's jamb), coloured floors 4.8 to 14. */
const WINDOW_STROKES = 4;

interface Spot {
  kind: string;
  x: number;
  y: number;
}

/** The middles of the narrow places of a floor: one-cell corridors, open doorways, a cave's ways out and a house's lawn. */
function narrowSpots(dungeon: VisibleDungeon, busy: ReadonlySet<string>): Spot[] {
  const free = (x: number, y: number): boolean => !busy.has(`${Math.floor(x)},${Math.floor(y)}`);
  const spots: Spot[] = [];
  for (const room of dungeon.rooms) {
    if (room.kind !== 'corridor' || Math.min(room.w, room.h) !== 1) continue;
    for (let k = 0; k < room.w * room.h; k++) spots.push({ kind: 'corridor', x: room.x + (k % room.w) + 0.5, y: room.y + Math.floor(k / room.w) + 0.5 });
  }
  for (const door of dungeon.doors) if (door.kind === 'opening') spots.push({ kind: 'doorway', x: door.x + 0.5, y: door.y + 0.5 });
  const inside = spots.filter((s) => free(s.x, s.y) && dungeon.field.distance(s.x, s.y) <= -CLEAR);
  for (const way of dungeon.ways) {
    for (const u of [0.8, 1.2, 1.6]) {
      const p = wayPoint(way, u, wayCentre(way, u));
      if (dungeon.field.distance(p.x, p.y) > CLEAR && wayStrength(way, p) >= 0.5) inside.push({ kind: 'way out', ...p });
    }
  }
  const grounds = groundsLayout(dungeon.floor);
  const ways = new Set(grounds?.wayCells.map((c) => `${Math.floor(c.x)},${Math.floor(c.y)}`));
  for (const c of grounds?.lawnCells ?? []) {
    const p = { x: Math.floor(c.x) + 0.5, y: Math.floor(c.y) + 0.5 };
    if (!ways.has(`${Math.floor(c.x)},${Math.floor(c.y)}`) && dungeon.field.distance(p.x, p.y) > 1.5) inside.push({ kind: 'lawn', ...p });
  }
  return inside;
}

interface CellReading {
  covered: number;
  spread: number;
}

function readCell(data: Uint8ClampedArray, width: number, x0: number, y0: number, size: number, paper: readonly number[]): CellReading {
  let off = 0;
  let n = 0;
  let sum = 0;
  let squares = 0;
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
      if (Math.hypot(r - paper[0]!, g - paper[1]!, b - paper[2]!) > OFF_PAPER) off++;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += l;
      squares += l * l;
      n++;
    }
  }
  const mean = sum / n;
  return { covered: off / n, spread: Math.sqrt(Math.max(0, squares / n - mean * mean)) };
}

describe('crayon floors are coloured in', () => {
  const style = dungeonStyle('crayon');
  const paper = parseHex(vellumColours(style.colors.paper).inner);
  for (const [name, request, narrowKinds] of CASES) {
    it(name, () => {
      const kinds: string[] = [];
      const model = generateDungeon(request);
      const layout = mapLayout(model, PX, DEFAULT_VIEW);
      for (let floor = 0; floor < model.floors.length; floor++) {
        const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
        const ctx = canvas.getContext('2d')!;
        renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: PX, floor });
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dungeon = visibleDungeon(model, DEFAULT_VIEW, floor);
        const f = dungeon.floor;
        const busy = new Set([
          ...f.terrain.flatMap((p) => p.cells),
          ...f.waterCells,
          ...f.stairs.flatMap((s) => Array.from({ length: s.w * s.h }, (_, k) => ({ x: s.x + (k % s.w), y: s.y + Math.floor(k / s.w) }))),
          ...[...f.props, ...f.columns].map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })),
        ].map((c) => `${c.x},${c.y}`));
        const bare: string[] = [];
        let open = 0;
        const b = dungeon.bounds;
        for (let cy = Math.floor(b.minY); cy < b.maxY; cy++) {
          for (let cx = Math.floor(b.minX); cx < b.maxX; cx++) {
            // Whole cells of floor, a cell clear of any wall, whose shade and hatching would count as colour.
            if (busy.has(`${cx},${cy}`) || dungeon.field.distance(cx + 0.5, cy + 0.5) > -1) continue;
            open++;
            const at = Math.round((cx - layout.originCell.x + 0.2) * PX);
            const top = Math.round((cy - layout.originCell.y + 0.2) * PX);
            const cell = readCell(data, canvas.width, at, top, Math.round(PX * 0.6), paper);
            if (cell.covered < COVERED || cell.spread < STROKES) bare.push(`${cx},${cy} (${cell.covered.toFixed(2)}, ${cell.spread.toFixed(1)})`);
          }
        }
        const narrow = narrowSpots(dungeon, busy);
        for (const spot of narrow) {
          const size = Math.round(PX * WINDOW);
          const at = Math.round((spot.x - layout.originCell.x) * PX - size / 2);
          const top = Math.round((spot.y - layout.originCell.y) * PX - size / 2);
          const reading = readCell(data, canvas.width, at, top, size, paper);
          if (reading.spread < WINDOW_STROKES) bare.push(`${spot.kind} at ${spot.x.toFixed(1)},${spot.y.toFixed(1)} (${reading.spread.toFixed(1)})`);
        }
        kinds.push(...narrow.map((spot) => spot.kind));
        expect(open, `${name} floor ${floor}: open floor cells`).toBeGreaterThan(10);
        expect(bare, `${name} floor ${floor}: ${bare.length} of ${open} open cells and ${narrow.length} narrow places left bare`).toEqual([]);
      }
      // Each case reads the narrow places it is chosen for.
      for (const kind of narrowKinds) expect(kinds, `${name}: ${kind}`).toContain(kind);
    });
  }
});
