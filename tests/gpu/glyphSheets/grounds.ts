import { describe, expect, it } from 'vitest';
import { commands } from 'vitest/browser';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest, GroundsKind } from '../../../src/app/dungeons/model';
import { renderMapSvg } from '../../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import { drawToken } from '../dungeonArtSheets';
import { RENDER_OUT, savePng } from '../dungeonRenderHarness';
import { drawWindow, offMonochrome } from '../glyphSheetChecks';
import type { GlyphSpecimen, SpecimenScene } from './types';

/**
 * A Haunted Mansion's grounds and its walls (`render/grounds/`, `render/house/`), in windows of
 * generated houses chosen by what they hold: the front with its porch and the drive round its
 * fountain, the gate, the carriage house and its service gate, the crypt, greenhouse and parterre
 * behind the house, a medium house's path to its porch, the house's own outer wall with its
 * windows and a chimney stack, a stair hall's tall window, a cellar's small one, and a fireplace in
 * its stack, cold and, in the house lived in, burning.
 */

const LARGE: DungeonRequest = { seed: 2, theme: 'mansion', tags: ['large', 'overgrown'], floors: 3 };
const MEDIUM: DungeonRequest = { seed: 16, theme: 'mansion', tags: [], floors: 2 };
/** The large house lived in: its fireplaces burn. */
const LIVED: DungeonRequest = { ...LARGE, tags: [...LARGE.tags, 'inhabited'] };

const models = new Map<DungeonRequest, DungeonModel>();
const modelOf = (request: DungeonRequest): DungeonModel => {
  if (!models.has(request)) models.set(request, generateDungeon(request));
  return models.get(request)!;
};

const CELLS = 12;
const ROWS = 8;

/** A window round the first piece of `kind` (and of `use`, for an outbuilding), its middle `shift` cells off the piece's first cell. */
function around(request: DungeonRequest, kind: GroundsKind, shift = { x: 0, y: 0 }, use?: string): SpecimenScene['window'] {
  const piece = modelOf(request).floors[0]!.grounds!.pieces.find((p) => p.kind === kind && (!use || p.use === use));
  if (!piece) throw new Error(`no ${kind} ${use ?? ''}`);
  const c = piece.cells[0]!;
  return { x: Math.round(c.x + shift.x - CELLS / 2), y: Math.round(c.y + shift.y - ROWS / 2), cells: CELLS, rows: ROWS };
}

/** A window on the house's outer wall where a chimney stack stands near a window. */
function wallWindow(request: DungeonRequest): SpecimenScene['window'] {
  const floor = modelOf(request).floors[0]!;
  const stack = floor.stacks!.find((s) => floor.windows!.some((w) => Math.hypot(w.x - s.x, w.y - s.y) < 4)) ?? floor.stacks![0]!;
  return { x: stack.x - 4, y: stack.y - 3, cells: 8, rows: 6 };
}

/** A window of 6 × 4 cells round the first window of `size` on any floor, or the first fireplace. */
function aroundHouse(request: DungeonRequest, find: 'tall' | 'small' | 'hearth'): { floor: number; window: SpecimenScene['window'] } {
  const floors = modelOf(request).floors;
  for (let floor = 0; floor < floors.length; floor++) {
    const { windows = [], props } = floors[floor]!;
    const at = find === 'hearth' ? props.find((p) => p.kind === 'hearth') : windows.find((w) => w.size === find);
    if (at) return { floor, window: { x: Math.round(at.x - 3), y: Math.round(at.y - 2), cells: 6, rows: 4 } };
  }
  throw new Error(`no ${find}`);
}

function scenes(): SpecimenScene[] {
  const scene = (name: string, request: DungeonRequest, window: () => SpecimenScene['window'], floor = 0): SpecimenScene => {
    let cached: SpecimenScene['window'];
    return {
      name,
      model: () => modelOf(request),
      floor,
      get window() {
        return (cached ??= window());
      },
    };
  };
  return [
    scene('large-front', LARGE, () => around(LARGE, 'porch', { x: 1, y: 3 })),
    scene('large-gate', LARGE, () => around(LARGE, 'gate', { x: 1, y: -2 })),
    scene('large-service', LARGE, () => around(LARGE, 'outbuilding', { x: 2, y: 1 }, 'carriage-house')),
    scene('large-garden', LARGE, () => around(LARGE, 'hedge', { x: -2, y: -2 })),
    scene('large-crypt', LARGE, () => around(LARGE, 'outbuilding', { x: 1, y: 1 }, 'crypt')),
    scene('medium-front', MEDIUM, () => around(MEDIUM, 'porch', { x: 1, y: 2 })),
    scene('house-wall', MEDIUM, () => wallWindow(MEDIUM)),
    ...(['tall', 'small', 'hearth'] as const).map((find) => scene(find === 'hearth' ? 'fireplace' : `${find}-window`, LARGE, () => aroundHouse(LARGE, find).window, aroundHouse(LARGE, find).floor)),
    scene('fireplace-lit', LIVED, () => aroundHouse(LIVED, 'hearth').window, aroundHouse(LIVED, 'hearth').floor),
  ];
}

export const SPECIMEN: GlyphSpecimen = { family: 'grounds', pieces: [], crowded: [], scenes: scenes() };

/** The grounds need the same close, small, monochrome and SVG proof as the prop sheets, in every look. */
const asked = !import.meta.env.VITE_GLYPH_FAMILY || import.meta.env.VITE_GLYPH_FAMILY === 'grounds';
describe.skipIf(!asked)('grounds proof', () => {
  for (const { id } of DUNGEON_STYLES) {
    it(`keeps the grounds readable at every size in ${id}`, async () => {
      const style = dungeonStyle(id);
      for (const scene of SPECIMEN.scenes ?? []) {
        const model = scene.model();
        const window = scene.window!;
        for (const [suffix, px, mono] of [['100', 100, false], ['24', 24, false], ['close', 300, false], ['mono', 150, true]] as const) {
          const drawn = drawWindow(model, style, { ...DEFAULT_VIEW, monochrome: mono }, px, window, scene.floor);
          expect(drawn.texts).toEqual([]);
          if (mono) expect(offMonochrome(drawn.canvas, style), `${scene.name} monochrome`).toBe(0);
          if (suffix === '100') drawToken(drawn.canvas.getContext('2d')!, (window.cells / 2 + 0.5) * px, (window.rows / 2 + 0.5) * px, 0.42 * px, '#2e86c1');
          await savePng(drawn.canvas, `glyph-sheets/grounds/${scene.name}-${id}-${suffix}`);
        }
      }
      const { svg } = renderMapSvg(modelOf(LARGE), style, DEFAULT_VIEW, { pxPerCell: 30, floor: 0 });
      expect(svg).toContain('<path');
      expect(svg).not.toContain('<text');
      await commands.writeFile(`${RENDER_OUT}/glyph-sheets/grounds/large-${id}.svg`, svg);
    });
  }
});
