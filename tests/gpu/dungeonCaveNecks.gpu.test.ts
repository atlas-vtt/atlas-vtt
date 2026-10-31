import { describe, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel } from '../../src/app/dungeons/model';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { caveVeinWaysModel } from './caveVeinWays';
import { RENDER_OUT, savePng } from './dungeonRenderHarness';

/**
 * The necks of the narrow ways as a person judges them: the six-way chamber and three spots of
 * generated caves (two squeezes in a row on a wide passage, a squeeze where a wide passage meets a
 * one-cell one, a squeeze between two one-cell passages), in every painter, written to
 * `out/dungeon-render/necks/` with `VITE_NECK_LABEL` (before, after) in their names. They judge
 * nothing, so they are drawn only when asked for: `VITE_NECK_RENDERS=1`.
 */

const env = import.meta.env as Record<string, string | undefined>;
const LABEL = env.VITE_NECK_LABEL ?? 'now';
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'crayon'];
const PX = 100;

interface Spot {
  name: string;
  model: () => DungeonModel;
  /** The window's corner and size, in cells. */
  origin: { x: number; y: number };
  cells: { w: number; h: number };
}

const cave = (seed: number, tags: string[]) => (): DungeonModel => generateDungeon({ seed, theme: 'cavern', tags, floors: 1 });

const SPOTS: readonly Spot[] = [
  { name: 'fixture', model: () => caveVeinWaysModel(), origin: { x: -1, y: -1 }, cells: { w: 19, h: 19 } },
  // Squeezes at (29, −18) and (34, −18), the way running east: what the maintainer saw. The chamber between
  // them cannot give up the cells beside the second, which is walked now (`walkLooseNecks`).
  { name: 'pair-1394744', model: cave(1_394_744, ['large']), origin: { x: 24, y: -23 }, cells: { w: 16, h: 10 } },
  // A squeeze at (−14, −14), the way running west from a passage three cells wide into a one-cell one.
  { name: 'wide-784981', model: cave(784_981, ['winding']), origin: { x: -20, y: -19 }, cells: { w: 12, h: 10 } },
  // A squeeze at (14, −9) between two passages of one cell.
  { name: 'narrow-1553124', model: cave(1_553_124, ['spacious']), origin: { x: 9, y: -14 }, cells: { w: 12, h: 10 } },
];

describe.skipIf(env.VITE_NECK_RENDERS !== '1')('the necks of the narrow ways, for judging by eye', () => {
  for (const spot of SPOTS) {
    it(`draws ${spot.name}`, async () => {
      const model = spot.model();
      for (const look of LOOKS) {
        const canvas = new OffscreenCanvas(spot.cells.w * PX, spot.cells.h * PX);
        renderMap(canvas.getContext('2d')!, model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: PX, floor: 0, openings: 'drawn', window: { originCell: spot.origin, widthPx: canvas.width, heightPx: canvas.height } });
        await savePng(canvas, `${LABEL}-${spot.name}-${look}`, `${RENDER_OUT}/necks`);
      }
    });
  }
});
