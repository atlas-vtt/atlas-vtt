import { describe, it } from 'vitest';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { RENDER_OUT, savePng } from './dungeonRenderHarness';

/**
 * Every way up and down a generated cave draws (shafts, avens, chasms, climbs, pitches and scree
 * between floors, ledges, platforms, the floor under a hole) and every sump, cropped round it in every painter,
 * for a person to judge by eye: written to `out/dungeon-render/vertical/<VITE_VERTICAL_LABEL>/`,
 * with one whole floor in Crayon. A hole over a floor below is cut out of the map, so each crop lies
 * on a grey the map's own paper never is, where the level below would show. They judge nothing,
 * so they are drawn only when asked for: `VITE_VERTICAL_CROPS=1`.
 */

const env = import.meta.env as Record<string, string | undefined>;
const LABEL = env.VITE_VERTICAL_LABEL ?? 'now';
const OUT = `${RENDER_OUT}/vertical/${LABEL}`;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'crayon'];
const PX = 100;
/** How many of each feature are cropped. */
const EACH = 2;
/** Only the features whose names start with one of these, where given (`VITE_VERTICAL_ONLY=shaft,chasm`). */
const ONLY = env.VITE_VERTICAL_ONLY?.split(',') ?? null;
const BELOW = '#7f8a8f';

const REQUESTS: readonly DungeonRequest[] = [
  { seed: 285084, theme: 'cavern', tags: [], floors: 1 },
  { seed: 11, theme: 'cavern', tags: ['large', 'wet'], floors: 2 },
  { seed: 42, theme: 'cavern', tags: ['small', 'cramped', 'winding'], floors: 1 },
  { seed: 7, theme: 'cavern', tags: ['medium', 'flooded', 'deep'], floors: 3 },
  { seed: 3, theme: 'cavern', tags: ['dry', 'crumbling'], floors: 1 },
  { seed: 5, theme: 'cavern', tags: [], floors: 2 },
  { seed: 8, theme: 'cavern', tags: ['large'], floors: 2 },
  { seed: 21, theme: 'cavern', tags: ['deep'], floors: 3 },
  { seed: 13, theme: 'cavern', tags: ['large', 'crumbling'], floors: 2 },
  { seed: 31, theme: 'cavern', tags: ['spacious'], floors: 2 },
];

interface Crop {
  feature: string;
  request: number;
  floor: number;
  origin: { x: number; y: number };
  cells: { w: number; h: number };
  what: string;
}

function around(x0: number, y0: number, x1: number, y1: number, margin = 2): Pick<Crop, 'origin' | 'cells'> {
  return { origin: { x: Math.floor(x0) - margin, y: Math.floor(y0) - margin }, cells: { w: Math.ceil(x1 - x0) + margin * 2, h: Math.ceil(y1 - y0) + margin * 2 } };
}

function cropsOf(model: DungeonModel, request: number): Crop[] {
  const crops: Crop[] = [];
  model.floors.forEach((floor, index) => {
    for (const piece of floor.terrain) {
      if (!['shaft', 'chasm', 'aven', 'ledge', 'platform', 'chasm-floor', 'boulder-choke', 'pit', 'bridge'].includes(piece.kind)) continue;
      const xs = piece.cells.map(c => c.x);
      const ys = piece.cells.map(c => c.y);
      const bottom = piece.opening ? ` bottom ${piece.opening.bottom ?? 'none'}` : '';
      const drop = piece.traits.drop ? ` ${piece.traits.drop.depth} ft ${piece.traits.drop.kind}` : '';
      const narrow = piece.kind === 'shaft' && piece.traits.drop?.kind && piece.traits.drop.kind !== 'shaft' ? `-${piece.traits.drop.kind}` : '';
      const kind = `${piece.kind}${narrow}${piece.opening && piece.opening.bottom !== null ? '-to-floor' : ''}`;
      crops.push({ feature: kind, request, floor: index, ...around(Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1), what: `${piece.cells.length} cells${drop}${bottom} elevation ${piece.traits.elevation ?? 0}` });
    }
    for (const door of floor.doors) {
      if (door.way === 'climb') crops.push({ feature: 'climb', request, floor: index, ...around(door.x, door.y, door.x + 1, door.y + 1, 3), what: `${door.drop?.depth} ft ${door.drop?.kind} ${door.descends ? 'down' : 'up'} towards ${door.dir.x},${door.dir.y}` });
      else if (door.way === 'sump') crops.push({ feature: 'sump', request, floor: index, ...around(door.x, door.y, door.x + 1, door.y + 1, 3), what: `towards ${door.dir.x},${door.dir.y}` });
      else if (door.kind === 'steps') crops.push({ feature: 'steps', request, floor: index, ...around(door.x, door.y, door.x + 1, door.y + 1, 3), what: `${door.descends ? 'down' : 'up'} towards ${door.dir.x},${door.dir.y}` });
    }
    for (const stair of floor.stairs) {
      const end = stair.to > index ? 'upper' : 'lower';
      crops.push({ feature: `${stair.way}-${end}`, request, floor: index, ...around(stair.x, stair.y, stair.x + stair.w, stair.y + stair.h), what: `${stair.w}×${stair.h} to floor ${stair.to}` });
    }
  });
  return crops;
}

describe.skipIf(env.VITE_VERTICAL_CROPS !== '1')('the ways up and down, for judging by eye', () => {
  it('crops every vertical feature in every painter', async () => {
    const models = REQUESTS.map(request => generateDungeon(request));
    const counts = new Map<string, number>();
    const listed: string[] = [];
    for (const [request, model] of models.entries()) {
      for (const crop of cropsOf(model, request)) {
        if (ONLY && !ONLY.some(prefix => crop.feature.startsWith(prefix))) continue;
        const seen = counts.get(crop.feature) ?? 0;
        if (seen >= EACH) continue;
        counts.set(crop.feature, seen + 1);
        const name = `${crop.feature}-${seen + 1}`;
        listed.push(`${name}\tseed ${REQUESTS[request]!.seed} floor ${crop.floor}\t${crop.what}`);
        for (const look of LOOKS) {
          const canvas = new OffscreenCanvas(crop.cells.w * PX, crop.cells.h * PX);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = BELOW;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const drawn = new OffscreenCanvas(canvas.width, canvas.height);
          renderMap(drawn.getContext('2d')!, model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: PX, floor: crop.floor, window: { originCell: crop.origin, widthPx: canvas.width, heightPx: canvas.height } });
          ctx.drawImage(drawn, 0, 0);
          await savePng(canvas, `${name}-${look}`, OUT);
        }
      }
    }
    await commands.writeFile(`${OUT}/crops.txt`, `${listed.join('\n')}\n`);
  });

  it.skipIf(ONLY !== null)('draws one whole floor in Crayon', async () => {
    const model = generateDungeon(REQUESTS[1]!);
    const layout = mapLayout(model, PX, DEFAULT_VIEW);
    for (const floor of [0, 1]) {
      const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = BELOW;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const drawn = new OffscreenCanvas(canvas.width, canvas.height);
      renderMap(drawn.getContext('2d')!, model, dungeonStyle('crayon'), DEFAULT_VIEW, { pxPerCell: PX, floor });
      ctx.drawImage(drawn, 0, 0);
      await savePng(canvas, `full-large-wet-11-${floor ? 'B' : 'A'}-crayon`, OUT);
    }
  });
});
