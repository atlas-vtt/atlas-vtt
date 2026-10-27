import { describe, expect, it } from 'vitest';
import { floorBelow, stackOf } from '../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW, type DungeonView } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { savePng, withoutText } from './dungeonRenderHarness';

/**
 * Dungeons with their terrain over seeds, boss room on and off, five-room dungeons and one to four
 * floors, written to `out/dungeon-render/v2-terrain/` for a person to judge: each floor as the
 * scene sees it (holes cut out), and a sheet of all floors side by side with each floor laid over
 * the one below, dimmed, as Atlas shows a level over the level below.
 */

const PX = 48;

const CASES: readonly { name: string; request: DungeonRequest; look: DungeonStyleId; view?: Partial<DungeonView> }[] = [
  { name: 'one-floor', request: { seed: 16, tags: [], floors: 1 }, look: 'parchment' },
  { name: 'one-floor-no-boss', request: { seed: 16, tags: [], floors: 1, bossRoom: false }, look: 'parchment' },
  { name: 'large-fortress', request: { seed: 777, theme: 'fortress', tags: ['large', 'colonnades'], floors: 1 }, look: 'masonry' },
  { name: 'crumbling', request: { seed: 202, tags: ['crumbling', 'medium'], floors: 1 }, look: 'stipple' },
  { name: 'wet-cavern', request: { seed: 909, theme: 'cavern', tags: ['wet'], floors: 1 }, look: 'parchment' },
  { name: 'five-room-a', request: { seed: 42, tags: [], floors: 1, fiveRoom: true }, look: 'parchment' },
  { name: 'five-room-b', request: { seed: 4242, theme: 'fortress', tags: ['colonnades'], floors: 1, fiveRoom: true }, look: 'night' },
  { name: 'five-room-c', request: { seed: 99, tags: ['crumbling'], floors: 1, fiveRoom: true }, look: 'drafting' },
  { name: 'two-floors', request: { seed: 31, tags: [], floors: 2 }, look: 'parchment' },
  { name: 'three-floors', request: { seed: 404, tags: ['deep'], floors: 3 }, look: 'parchment' },
  { name: 'four-floors', request: { seed: 1121, tags: ['large'], floors: 4 }, look: 'parchment' },
  // Rising stacks: the entrance floor is the lowest; a minstrels' gallery, murder holes in a gate chamber, a stair well and a light well look down into it.
  { name: 'fortress-rising-3f', request: { seed: 11, theme: 'fortress', tags: [], floors: 3 }, look: 'masonry' },
  { name: 'mansion-rising-3f', request: { seed: 5, theme: 'mansion', tags: [], floors: 3 }, look: 'parchment' },
  { name: 'four-floors-mono', request: { seed: 515, tags: ['crumbling'], floors: 4 }, look: 'slate', view: { monochrome: true } },
  // A sweep of seeds over every floor count, a boss room or none, and five-room dungeons.
  ...[1, 2, 3, 4].flatMap((floors) =>
    [11, 23, 37].map((seed) => ({ name: `sweep-${floors}f-${seed}`, request: { seed: seed * 1013 + floors, tags: [], floors, bossRoom: seed !== 23 }, look: 'parchment' as const })),
  ),
  ...[7, 8, 9, 10].map((seed) => ({ name: `sweep-five-room-${seed}`, request: { seed: seed * 977, theme: seed % 2 ? 'fortress' : undefined, tags: seed % 2 ? ['colonnades'] : ['wet'], floors: 1, fiveRoom: true }, look: 'masonry' as const })),
];

function floorCanvas(model: DungeonModel, look: DungeonStyleId, view: DungeonView, floor: number): OffscreenCanvas {
  const layout = mapLayout(model, PX, view);
  const canvas = new OffscreenCanvas(layout.widthPx, layout.heightPx);
  const { ctx, texts } = withoutText(canvas.getContext('2d')!);
  renderMap(ctx, model, dungeonStyle(look), view, { pxPerCell: PX, floor });
  expect(texts).toEqual([]);
  return canvas;
}

/** All floors side by side, each over the floor physically below it, dimmed, where it is cut. */
function sheet(model: DungeonModel, floors: readonly OffscreenCanvas[]): OffscreenCanvas {
  const first = floors[0]!;
  const gap = 24;
  const out = new OffscreenCanvas(first.width * floors.length + gap * (floors.length - 1), first.height);
  const ctx = out.getContext('2d')!;
  floors.forEach((canvas, k) => {
    const x = k * (first.width + gap);
    const below = floors[floorBelow(stackOf(model), k) ?? -1];
    ctx.fillStyle = '#111111';
    ctx.fillRect(x, 0, first.width, first.height);
    if (below) {
      ctx.globalAlpha = 0.6;
      ctx.drawImage(below, x, 0);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(canvas, x, 0);
  });
  return out;
}

describe('dungeons with terrain, for judging by eye', () => {
  for (const { name, request, look, view: change } of CASES) {
    it(`draws ${name}`, async () => {
      const view: DungeonView = { ...DEFAULT_VIEW, ...change };
      const model = generateDungeon(request);
      const floors = model.floors.map((_, index) => floorCanvas(model, look, view, index));
      await savePng(sheet(model, floors), `v2-terrain/${name}`);
    });
  }
});
