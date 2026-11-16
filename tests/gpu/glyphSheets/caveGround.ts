import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { CAVE_GROUND } from '../../../src/app/dungeons/render/cave/ground';
import { visibleDungeon } from '../../../src/app/dungeons/render/visibleDungeon';
import { renderMapSvg } from '../../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { drawToken } from '../dungeonArtSheets';
import { RENDER_OUT, savePng } from '../dungeonRenderHarness';
import { drawWindow, offMonochrome } from '../glyphSheetChecks';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest, DungeonRoom } from '../../../src/app/dungeons/model';
import type { GlyphSpecimen, SpecimenScene } from './types';

const REQUESTS: readonly DungeonRequest[] = [
  { seed: 606, theme: 'cavern', tags: ['medium'], floors: 1 },
  { seed: 707, theme: 'cavern', tags: ['large', 'lava'], floors: 3 },
  { seed: 808, theme: 'cavern', tags: ['small', 'secret', 'wet'], floors: 2 },
  { seed: 909, theme: 'cavern', tags: [], floors: 1, fiveRoom: true },
];

function centre(room: DungeonRoom): { x: number; y: number } {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

/** Each fidelity seed, with a window chosen from the actual generated floor. */
function specimens(): SpecimenScene[] {
  return REQUESTS.map((request, i) => {
    let cached: DungeonModel | undefined;
    const model = (): DungeonModel => cached ??= generateDungeon(request);
    const floor = model().floors[0]!;
    const chamber = floor.rooms.find(room => room.kind === 'room')!;
    const tunnel = floor.rooms.find(room => room.kind === 'corridor') ?? chamber;
    const mouth = floor.doors.find(door => door.from === null && door.wide)!;
    const spots = [centre(chamber), centre(tunnel), { x: mouth.x + 0.5, y: mouth.y + 0.5 }, centre(chamber)];
    const at = spots[i]!;
    return { name: `${request.seed}-${['junction', 'tunnel', 'mouth', 'chamber'][i]}`, model, floor: 0, window: { x: Math.floor(at.x - 5), y: Math.floor(at.y - 3), cells: 10, rows: 6 } };
  });
}

export const SPECIMEN: GlyphSpecimen = { family: 'caveGround', pieces: [], crowded: [], scenes: specimens() };

/** Cave scenes need the same close, small, monochrome and SVG proof as the prop sheets. */
const asked = !import.meta.env.VITE_GLYPH_FAMILY || import.meta.env.VITE_GLYPH_FAMILY === 'caveGround';
describe.skipIf(!asked)('cave ground proof', () => {
  for (const { id } of DUNGEON_STYLES) {
    it(`keeps the cave ground readable at every size in ${id}`, async () => {
      const style = dungeonStyle(id);
      for (const scene of SPECIMEN.scenes ?? []) {
        const model = scene.model();
        for (const [suffix, px, mono] of [['100', 100, false], ['24', 24, false], ['close', 300, false], ['mono', 150, true]] as const) {
          const view = { ...DEFAULT_VIEW, monochrome: mono };
          const drawn = drawWindow(model, style, view, px, scene.window!, scene.floor);
          expect(drawn.texts).toEqual([]);
          if (mono) expect(offMonochrome(drawn.canvas, style), `${scene.name} monochrome`).toBe(0);
          if (suffix === '100') {
            const dungeon = visibleDungeon(model, view, scene.floor);
            const window = scene.window!;
            const cells = dungeon.floor.rooms.flatMap(room => room.cells ?? []);
            const fit = cells.map(cell => ({ x: cell.x + 0.5, y: cell.y + 0.5 }))
              .filter(p => p.x > window.x + 1 && p.x < window.x + window.cells - 1 && p.y > window.y + 1 && p.y < window.y + window.rows - 1 && dungeon.field.distance(p.x, p.y) < -0.45);
            const distance = (p: { x: number; y: number }): number => Math.hypot(p.x - window.x - 5, p.y - window.y - 3);
            fit.sort((a, b) => distance(a) - distance(b));
            const at = fit[0];
            expect(at, `${scene.name} has room for a token`).toBeDefined();
            if (at) drawToken(drawn.canvas.getContext('2d')!, (at.x - window.x) * px, (at.y - window.y) * px, 0.42 * px, '#2e86c1');
          }
          await savePng(drawn.canvas, `glyph-sheets/caveGround/${scene.name}-${id}-${suffix}`);
        }
        const { svg } = renderMapSvg(model, style, DEFAULT_VIEW, { pxPerCell: 30, floor: scene.floor });
        expect(svg).toContain('<path');
        expect(svg).not.toContain('<text');
        await commands.writeFile(`${RENDER_OUT}/glyph-sheets/caveGround/${scene.name}-${id}.svg`, svg);
      }
    });
  }

  it('records each ground part cost in both painters at play zoom', async () => {
    const scene = SPECIMEN.scenes![0]!;
    const rows = ['Median milliseconds per 10 × 6 cell window, 150 px/cell, 7 warmed draws; includes path construction and drawing commands.'];
    for (const look of ['masonry', 'drafting'] as const) {
      const style = dungeonStyle(look);
      const painter = style.direction;
      for (const part of ['floor', 'edge', 'surround'] as const) {
        const painting = CAVE_GROUND[part]!;
        const samples: number[] = [];
        // Wrap each typed painter separately so the registry's different colour arguments stay checked.
        const stone = painting.stone;
        const engraved = painting.engraved;
        painting.stone = (art, colours): void => {
          const start = performance.now();
          stone(art, colours);
          samples.push(performance.now() - start);
        };
        painting.engraved = (art, pens): void => {
          const start = performance.now();
          engraved(art, pens);
          samples.push(performance.now() - start);
        };
        try {
          for (let k = 0; k < 8; k++) drawWindow(scene.model(), style, DEFAULT_VIEW, 150, scene.window!, 0);
        } finally {
          painting.stone = stone;
          painting.engraved = engraved;
        }
        const measured = samples.slice(1).sort((a, b) => a - b);
        rows.push(`${part} ${painter}: ${measured[Math.floor(measured.length / 2)]!.toFixed(2)} ms`);
      }
    }
    await commands.writeFile(`${RENDER_OUT}/glyph-sheets/caveGround/cost.txt`, rows.join('\n'));
  });
});
