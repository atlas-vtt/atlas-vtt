import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { fittedPxPerCell, renderMap } from '../../src/app/dungeons/render/renderMap';
import { thumbnailWindow } from '../../src/app/dungeons/render/thumbnail';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import type { DungeonView } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { withoutText } from './dungeonRenderHarness';

/** Dungeons and pictures for judging the looks by eye: whole maps, and close-ups with tokens on them. */

export const ART_DUNGEONS: readonly { name: string; request: DungeonRequest }[] = [
  { name: 'halls', request: { seed: 16, tags: ['dry'], floors: 1 } },
  { name: 'fortress', request: { seed: 404, theme: 'fortress', tags: ['round', 'colonnades', 'crumbling'], floors: 1 } },
  { name: 'mansion', request: { seed: 16, theme: 'mansion', tags: [], floors: 2 } },
  { name: 'flooded', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1, waterLevel: 0.6 } },
  { name: 'five-room', request: { seed: 42, tags: [], floors: 1, fiveRoom: true } },
  { name: 'crumbling', request: { seed: 202, tags: ['crumbling', 'medium'], floors: 1 } },
  { name: 'two-floors', request: { seed: 282, tags: ['small'], floors: 2 } },
  { name: 'three-floors', request: { seed: 404, tags: ['deep'], floors: 3 } },
  { name: 'overgrown-fortress', request: { seed: 404, theme: 'fortress', tags: ['round', 'colonnades', 'overgrown'], floors: 1 } },
  { name: 'overgrown-cavern', request: { seed: 909, theme: 'cavern', tags: ['wet', 'overgrown'], floors: 1, waterLevel: 0.4 } },
  { name: 'overgrown-mansion', request: { seed: 16, theme: 'mansion', tags: ['overgrown', 'ruined'], floors: 1 } },
  // A large house of three floors, its cellar the last: ground floor, first floor, cellar.
  { name: 'mansion-large-cellar', request: { seed: 2, theme: 'mansion', tags: ['large', 'overgrown'], floors: 3 } },
  { name: 'overgrown-halls', request: { seed: 202, tags: ['crumbling', 'medium', 'overgrown'], floors: 1 } },
  { name: 'wet-moss', request: { seed: 909, tags: ['wet'], floors: 1, waterLevel: 0.45 } },
  // Caverns, each variant: `VITE_ART_DUNGEON=cavern` draws them all.
  { name: 'cavern-limestone', request: { seed: 606, theme: 'cavern', tags: ['medium', 'wet'], floors: 2 } },
  { name: 'cavern-lava', request: { seed: 707, theme: 'cavern', tags: ['large', 'lava'], floors: 3 } },
  { name: 'cavern-underdark', request: { seed: 5, theme: 'cavern', tags: ['deep', 'spacious', 'flooded'], floors: 3 } },
  { name: 'cavern-inhabited', request: { seed: 808, theme: 'cavern', tags: ['inhabited', 'wet', 'secret'], floors: 2 } },
  { name: 'forest', request: { seed: 606, theme: 'forest', tags: ['medium', 'dry'], floors: 1 } },
  { name: 'forest-var-21', request: { seed: 21, theme: 'forest', tags: ['medium'], floors: 1 } },
  { name: 'forest-var-33', request: { seed: 33, theme: 'forest', tags: ['wet'], floors: 1 } },
  { name: 'forest-var-47', request: { seed: 47, theme: 'forest', tags: ['medium', 'wet'], floors: 1 } },
  { name: 'forest-var-58', request: { seed: 58, theme: 'forest', tags: [], floors: 1 } },
  { name: 'forest-var-71', request: { seed: 71, theme: 'forest', tags: ['large'], floors: 1 } },
  { name: 'forest-var-88', request: { seed: 88, theme: 'forest', tags: ['wet'], floors: 1 } },
  { name: 'forest-roads-101', request: { seed: 101, theme: 'forest', tags: [], floors: 1 } },
  { name: 'forest-roads-112', request: { seed: 112, theme: 'forest', tags: [], floors: 1 } },
  { name: 'forest-roads-114', request: { seed: 114, theme: 'forest', tags: [], floors: 1 } },
  { name: 'forest-roads-127', request: { seed: 127, theme: 'forest', tags: [], floors: 1 } },
  { name: 'forest-river', request: { seed: 404, theme: 'forest', tags: ['medium'], floors: 1 } },
  { name: 'forest-flooded', request: { seed: 5, theme: 'forest', tags: ['large', 'flooded'], floors: 1 } },
  { name: 'forest-wet', request: { seed: 909, theme: 'forest', tags: ['wet', 'overgrown'], floors: 2, waterLevel: 0.4 } },
  { name: 'cavern-five-room', request: { seed: 909, theme: 'cavern', tags: [], floors: 1, fiveRoom: true } },
];

const models = new Map<string, DungeonModel>();
export function artModel(name: string): DungeonModel {
  const found = ART_DUNGEONS.find(d => d.name === name)!;
  if (!models.has(name)) models.set(name, generateDungeon(found.request));
  return models.get(name)!;
}

export function drawWhole(model: DungeonModel, look: DungeonStyleId, view: DungeonView, floor: number, size = 1400): OffscreenCanvas {
  const pxPerCell = fittedPxPerCell(model, view, size, size);
  const layout = mapLayout(model, pxPerCell, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, dungeonStyle(look), view, { pxPerCell, floor, legibleAt: size / 1400 });
  if (texts.length) throw new Error('text on a map');
  return canvas;
}

const TOKEN_COLOURS = ['#c0392b', '#2e86c1', '#d4a017', '#27ae60', '#8e44ad'];

/** A token as a VTT draws one: a disc in its colour with a pale ring and a figure, casting a small shadow. */
export function drawToken(ctx: OffscreenCanvasRenderingContext2D, x: number, y: number, r: number, colour: string): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.25;
  ctx.shadowOffsetY = r * 0.08;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#f4f1ea';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.2, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.75, r * 0.6, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A window of `cells` × `rows` cells at `px` a cell (200 unless asked), on the busiest room, with a few tokens on open floor. */
export function drawClose(model: DungeonModel, look: DungeonStyleId, view: DungeonView, floor = 0, cells = 12, rows = 8, tokens = true, centre?: { x: number; y: number }, px = 200): OffscreenCanvas {
  const corner = centre ? { x: Math.round(centre.x - cells / 2), y: Math.round(centre.y - rows / 2) } : floor === 0 ? thumbnailWindow(model, view, cells, rows) : (() => {
    const b = visibleDungeon(model, view, floor).bounds;
    return { x: Math.round((b.minX + b.maxX) / 2 - cells / 2), y: Math.round((b.minY + b.maxY) / 2 - rows / 2) };
  })();
  const canvas = new OffscreenCanvas(cells * px, rows * px);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, dungeonStyle(look), view, { pxPerCell: px, floor, window: { originCell: corner, widthPx: canvas.width, heightPx: canvas.height } });
  if (texts.length) throw new Error('text on a map');
  if (tokens) {
    const dungeon = visibleDungeon(model, view, floor);
    const busy = new Set([...dungeon.floor.terrain.flatMap(p => p.cells.map(c => `${c.x},${c.y}`)), ...dungeon.floor.props.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`), ...dungeon.floor.columns.map(p => `${Math.floor(p.x)},${Math.floor(p.y)}`)]);
    let placed = 0;
    const raw = canvas.getContext('2d')!;
    for (let k = 0; k < 400 && placed < 4; k++) {
      const cx = corner.x + 1 + ((k * 7) % (cells - 2));
      const cy = corner.y + 1 + ((k * 3 + Math.floor(k / 5)) % (rows - 2));
      if (busy.has(`${cx},${cy}`) || dungeon.field.distance(cx + 0.5, cy + 0.5) > -0.45) continue;
      busy.add(`${cx},${cy}`);
      drawToken(raw, (cx - corner.x + 0.5) * px, (cy - corner.y + 0.5) * px, px * 0.42, TOKEN_COLOURS[placed % TOKEN_COLOURS.length]!);
      placed++;
    }
  }
  return canvas;
}

/** Close-ups of terrain worth judging: holes and their bridges, galleries, shafts, platforms, stairwells on both floors. */
export const ART_SPOTS: readonly { name: string; dungeon: string; floor: number; centre: { x: number; y: number }; cells?: number; rows?: number }[] = [
  { name: 'entrance', dungeon: 'halls', floor: 0, centre: { x: 0.5, y: 0.5 } },
  { name: 'chasm-bridge', dungeon: 'two-floors', floor: 0, centre: { x: -3.5, y: 2 } },
  { name: 'gallery-above', dungeon: 'two-floors', floor: 0, centre: { x: -2, y: 8.5 } },
  { name: 'arena-below', dungeon: 'two-floors', floor: 1, centre: { x: -6, y: 8 } },
  { name: 'stairs-down', dungeon: 'two-floors', floor: 0, centre: { x: -4, y: -15 } },
  { name: 'stairs-up', dungeon: 'two-floors', floor: 1, centre: { x: -4, y: -15 } },
  { name: 'shaft-gallery', dungeon: 'three-floors', floor: 1, centre: { x: 19.5, y: 0 } },
  { name: 'chasm-void', dungeon: 'three-floors', floor: 1, centre: { x: -1, y: -8 } },
  { name: 'deep-arena', dungeon: 'three-floors', floor: 2, centre: { x: 19, y: 3 } },
];

/** Close-ups of vegetation, one kind each: climbers on walls and columns, plants, undergrowth. */
export const GROWTH_SPOTS: readonly { name: string; dungeon: string; centre: { x: number; y: number } }[] = [
  { name: 'brambles', dungeon: 'overgrown-mansion', centre: { x: 8.5, y: -11.5 } },
  { name: 'thicket', dungeon: 'overgrown-halls', centre: { x: -17.5, y: 4 } },
  { name: 'tangled-roots', dungeon: 'overgrown-cavern', centre: { x: -6.5, y: 12 } },
  { name: 'roots', dungeon: 'overgrown-cavern', centre: { x: -9.5, y: 9 } },
  { name: 'creeper', dungeon: 'overgrown-cavern', centre: { x: 2, y: 6.5 } },
  { name: 'fungi', dungeon: 'overgrown-cavern', centre: { x: 1, y: 5 } },
  { name: 'column', dungeon: 'overgrown-halls', centre: { x: 5, y: 11 } },
  { name: 'ferns', dungeon: 'overgrown-mansion', centre: { x: -3, y: -4 } },
  { name: 'vine', dungeon: 'overgrown-fortress', centre: { x: 0.5, y: -6 } },
  { name: 'weeds', dungeon: 'overgrown-mansion', centre: { x: -3.5, y: -8 } },
  { name: 'wet-moss', dungeon: 'wet-moss', centre: { x: -1.5, y: 3 } },
];
