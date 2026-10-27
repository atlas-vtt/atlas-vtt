import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { groundDistance, wayCentre, wayPoint, type WayOut } from '../../src/app/dungeons/render/cave/mouth/wayOut';
import type { Vec } from '../../src/app/dungeons/render/geometry';
import { paletteOf, parseHex } from '../../src/app/dungeons/render/palette';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { DEFAULT_VIEW, type DungeonStyle } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { ART_DUNGEONS } from './dungeonArtSheets';
import { inkMask, type Picture } from './dungeonFidelityChecks';

/**
 * A cave's way out as drawn: before every mouth the floor's tone runs on over the paper, whole near
 * the mouth and fading to the paper's by the way's end, in both painters (parchment and night are
 * Stone & shadow, print is Engraved). Engraved also thins out in a stipple: its ink lies on the
 * fading ground, never on the ground at the mouth or past the way's end.
 */

/** Play zoom: the stipple is drawn to be read there. */
const PX = 150;
/** The window round a way out drawn, in cells. */
const WINDOW = 9;
const LOOKS: readonly DungeonStyleId[] = ['parchment', 'print', 'night'];
const REQUESTS: readonly DungeonRequest[] = [
  ...ART_DUNGEONS.filter((d) => d.request.theme === 'cavern').map((d) => d.request),
  ...Array.from({ length: 8 }, (_, k): DungeonRequest => ({ seed: 2000 + k * 41, theme: 'cavern', tags: [['inhabited'], [], ['wet'], ['winding']][k % 4]!, floors: 1 })),
];

/** A window of the map round a way out, and the cell its corner lies on. */
function draw(model: DungeonModel, style: DungeonStyle, way: WayOut): { picture: Picture; origin: Vec } {
  const middle = wayPoint(way, way.length / 2, 0);
  const origin = { x: Math.floor(middle.x - WINDOW / 2), y: Math.floor(middle.y - WINDOW / 2) };
  const size = WINDOW * PX;
  const ctx = new OffscreenCanvas(size, size).getContext('2d')!;
  renderMap(ctx, model, style, DEFAULT_VIEW, { pxPerCell: PX, floor: 0, window: { originCell: origin, widthPx: size, heightPx: size } });
  return { picture: { data: ctx.getImageData(0, 0, size, size).data, width: size, height: size }, origin };
}

const luminance = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/** Pixels of a strip of the way from `from` to `to` cells out, `across` cells to either side of its middle. */
function strip(way: WayOut, origin: Vec, from: number, to: number, across: number): Vec[] {
  const out: Vec[] = [];
  for (let u = from; u <= to; u += 1 / PX) {
    for (let v = -across; v <= across; v += 1 / PX) {
      const p = wayPoint(way, u, wayCentre(way, u) + v);
      out.push({ x: Math.floor((p.x - origin.x) * PX), y: Math.floor((p.y - origin.y) * PX) });
    }
  }
  return out;
}

const toneOf = (picture: Picture, pixels: readonly Vec[]): number =>
  median(pixels.map(({ x, y }) => {
    const i = (y * picture.width + x) * 4;
    return luminance(picture.data[i]!, picture.data[i + 1]!, picture.data[i + 2]!);
  }));

const inkShare = (mask: Uint8Array, picture: Picture, pixels: readonly Vec[]): number => pixels.filter(({ x, y }) => mask[y * picture.width + x]).length / pixels.length;

let toned = 0;

describe('a cave\'s way out as drawn', () => {
  for (const request of REQUESTS) {
    it(`runs on from every mouth and fades into the paper: seed ${request.seed} [${request.tags.join(',')}]`, () => {
      const model = generateDungeon(request);
      const dungeon = visibleDungeon(model, DEFAULT_VIEW, 0);
      const distance = groundDistance(dungeon.field);
      // A way that another floor lies across gives way to it; its tone is that floor's.
      const ways = dungeon.ways.filter((way) => {
        for (let u = 0.3; u <= way.length + 1; u += 0.1) if (distance(wayPoint(way, u, wayCentre(way, u))) < Math.min(u, 2.5) - 0.3) return false;
        return true;
      });
      for (const look of LOOKS) {
        const style = dungeonStyle(look);
        const palette = paletteOf(style, DEFAULT_VIEW);
        const floor = luminance(...parseHex(palette.floor));
        for (const way of ways) {
          const { picture, origin } = draw(model, style, way);
          const mask = inkMask(picture, parseHex(palette.ink));
          const where = `${look}, the way out at ${way.mouth.at.x}, ${way.mouth.at.y}`;
          const half = way.mouth.width / 2;
          const paper = toneOf(picture, strip(way, origin, way.length + 0.3, way.length + 0.6, 0.25 * half));
          const floorness = (from: number, to: number): number => (toneOf(picture, strip(way, origin, from, to, 0.25 * half)) - paper) / (floor - paper);
          if (Math.abs(floor - paper) > 8) {
            const near = floorness(0.15, 0.45);
            const middle = floorness(way.length * 0.55, way.length * 0.65);
            const end = floorness(way.length * 0.95, way.length * 1.05);
            expect(near, `${where}: the floor's tone beyond the mouth`).toBeGreaterThan(0.75);
            expect(middle, `${where}: fading halfway`).toBeLessThan(near);
            expect(end, `${where}: gone by its end`).toBeLessThan(0.12);
            expect(end, `${where}: fading towards its end`).toBeLessThan(middle);
            toned++;
          }
          if (style.direction === 'engraved') {
            const stipple = inkShare(mask, picture, strip(way, origin, way.length * 0.35, way.length * 0.95, half + 0.2));
            expect(stipple, `${where}: stipple on the fading ground`).toBeGreaterThan(0.002);
            expect(inkShare(mask, picture, strip(way, origin, 0.1, 0.4, 0.3 * half)), `${where}: ink on the ground at the mouth`).toBeLessThan(stipple / 4);
            expect(inkShare(mask, picture, strip(way, origin, way.length + 0.1, way.length + 0.5, 0.3 * half)), `${where}: ink past the way's end`).toBe(0);
          }
        }
      }
    }, 120_000);
  }
  it('measures the tone of many ways out in the cases above', () => {
    expect(toned).toBeGreaterThan(30);
  });
});
