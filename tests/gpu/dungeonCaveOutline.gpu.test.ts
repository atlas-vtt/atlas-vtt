import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mouthsOf, type Mouth } from '../../src/app/dungeons/render/art/mouths';
import { unionRings } from '../../src/app/dungeons/render/clipShapes';
import { shapeRings, type Vec } from '../../src/app/dungeons/render/geometry';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import type { DungeonStyle } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { ART_DUNGEONS } from './dungeonArtSheets';
import { inkMask, nearestInk, type Picture } from './dungeonFidelityChecks';

/**
 * A cave's walls as drawn: every stretch of the traced outline of its floor carries the walls' ink,
 * in both painters (parchment and night are Stone & shadow, print is Engraved), on every cavern of
 * the art sheets and on seeds of every kind. Only an entrance's mouth is open, and no wall's shadow
 * falls across it, since the ground before it is open (`mouthLane`), not rock.
 */

const PX = 60;
/** Ink this near a point of the outline, in pixels: the ink is centred on the outline's grown ring. */
const INK_REACH = 4;
/** Steps along the outline, in cells. */
const STEP = 0.05;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'night'];

const REQUESTS: readonly DungeonRequest[] = [
  ...ART_DUNGEONS.filter((d) => d.request.theme === 'cavern').map((d) => d.request),
  ...Array.from({ length: 16 }, (_, k): DungeonRequest => ({ seed: 1000 + k * 37, theme: 'cavern', tags: [['secret'], ['wet'], ['inhabited'], [], ['lava'], ['winding']][k % 6]!, floors: 1 + (k % 3) })),
];

function draw(model: DungeonModel, style: DungeonStyle, floor: number): Picture {
  const layout = mapLayout(model, PX, DEFAULT_VIEW);
  const ctx = new OffscreenCanvas(layout.widthPx, layout.heightPx).getContext('2d')!;
  renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: PX, floor });
  return { data: ctx.getImageData(0, 0, layout.widthPx, layout.heightPx).data, width: layout.widthPx, height: layout.heightPx };
}

/** Whether `p` lies on the mouth's own edge: the open line across its passage. */
function onMouth(p: Vec, mouths: readonly Mouth[]): boolean {
  return mouths.some(({ at, out, width }) => {
    const along = Math.abs((p.x - at.x) * out.y - (p.y - at.y) * out.x);
    const off = Math.abs((p.x - at.x) * out.x + (p.y - at.y) * out.y);
    return off < 0.06 && along <= width / 2 + 0.06;
  });
}

/** Stretches of the outline longer than a fifth of a cell without ink, off every mouth, as `(x, y) length` in cells. */
function uninked(rings: readonly (readonly Vec[])[], mask: Uint8Array, picture: Picture, origin: Vec, mouths: readonly Mouth[]): string[] {
  const inkNear = (p: Vec): boolean => nearestInk(mask, picture, { x: (p.x - origin.x) * PX, y: (p.y - origin.y) * PX }, INK_REACH) < Infinity;
  const out: string[] = [];
  for (const ring of rings) {
    let start: Vec | null = null;
    let length = 0;
    const close = (): void => {
      if (start && length > 0.2) out.push(`(${start.x.toFixed(2)}, ${start.y.toFixed(2)}) ${length.toFixed(2)}`);
      start = null;
      length = 0;
    };
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      for (let t = 0; t < l; t += STEP) {
        const p = { x: a.x + ((b.x - a.x) * t) / l, y: a.y + ((b.y - a.y) * t) / l };
        if (onMouth(p, mouths) || inkNear(p)) close();
        else {
          start ??= p;
          length += STEP;
        }
      }
    });
    close();
  }
  return out;
}

const luminance = (picture: Picture, p: Vec, origin: Vec): number => {
  const i = (Math.floor((p.y - origin.y) * PX) * picture.width + Math.floor((p.x - origin.x) * PX)) * 4;
  return 0.2126 * picture.data[i]! + 0.7152 * picture.data[i + 1]! + 0.0722 * picture.data[i + 2]!;
};

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/** How much darker the floor just inside a mouth is than the floor a cell further in, across the middle of its passage. */
function shadeAtMouth(picture: Picture, origin: Vec, { at, out, width }: Mouth): number {
  const strip = (from: number, to: number): number[] => {
    const values: number[] = [];
    for (let d = from; d <= to; d += 1 / PX) {
      for (let s = -0.2 * width; s <= 0.2 * width; s += 1 / PX) values.push(luminance(picture, { x: at.x - out.x * d - out.y * s, y: at.y - out.y * d + out.x * s }, origin));
    }
    return values;
  };
  return median(strip(1.05, 1.2)) - median(strip(0.04, 0.12));
}

describe('a cave\'s walls as drawn', () => {
  for (const request of REQUESTS) {
    it(`ink every stretch of the outline but the mouths: seed ${request.seed} [${request.tags.join(',')}]`, () => {
      const model = generateDungeon(request);
      const origin = mapLayout(model, PX, DEFAULT_VIEW).originCell;
      for (const look of LOOKS) {
        const style = dungeonStyle(look);
        const ink = parseHex(paletteOf(style, DEFAULT_VIEW).ink);
        model.floors.forEach((_, floor) => {
          const where = `${look}, floor ${floor}`;
          const picture = draw(model, style, floor);
          const dungeon = visibleDungeon(model, DEFAULT_VIEW, floor);
          const rings = unionRings(dungeon.floors.flatMap((shape) => shapeRings(shape, 0, PX)));
          const mouths = mouthsOf(dungeon);
          expect(uninked(rings, inkMask(picture, ink), picture, origin, mouths), `${where}: outline without ink`).toEqual([]);
          for (const mouth of mouths) {
            expect(shadeAtMouth(picture, origin, mouth), `${where}: shadow across the mouth at ${mouth.at.x}, ${mouth.at.y}`).toBeLessThan(20);
          }
        });
      }
    }, 120_000);
  }
});
