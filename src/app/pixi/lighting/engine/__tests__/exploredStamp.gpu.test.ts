import { Container, Graphics, Matrix, RenderTexture, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExploredShapes } from '../../../../vision/exploredShapes';
import type { Polygon } from '../../../../vision/visibility';
import { ExploredTexture } from '../../ExploredTexture';
import { StampScratch, TILE } from '../../StampScratch';
import { saveExploredMask } from '../../exploredMaskSaving';
import { createTestRenderer, readRgba } from './gpuTestUtils';

const SIZE = 64;
const p = (x: number, y: number): { x: number; y: number } => ({ x, y });
/** A right triangle whose hypotenuse runs diagonally through the map, x + y = 40. */
const TRIANGLE: Polygon = [p(0, 0), p(40, 0), p(0, 40)];
/** A triangle whose edges cross the first one's hypotenuse, so both are partial where they overlap. */
const OTHER: Polygon = [p(10, 25), p(25, 10), p(50, 50)];
const EVERYTHING: Polygon = [p(-10, -10), p(SIZE + 10, -10), p(SIZE + 10, SIZE + 10), p(-10, SIZE + 10)];
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
const stamp = (polygon: Polygon, clip: Polygon[] | null = null): ExploredShapes => ({ polygons: [polygon], clip });

/** The red channel of every texel, top row first. */
type Reds = (x: number, y: number) => number;

describe('explored stamps', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.unstubAllGlobals();
  });

  async function memory(size = SIZE): Promise<{ renderer: WebGLRenderer; explored: ExploredTexture }> {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: size, height: size });
    cleanup.push(() => explored.destroy());
    return { renderer, explored };
  }

  function reds(renderer: WebGLRenderer, explored: ExploredTexture): Reds {
    const { pixels } = renderer.extract.pixels({ target: explored.texture });
    const width = explored.texture.width;
    return (x, y) => pixels[(y * width + x) * 4]!;
  }

  async function stamped(shapes: ExploredShapes[]): Promise<Reds> {
    const { renderer, explored } = await memory();
    for (const s of shapes) explored.add(s);
    return reds(renderer, explored);
  }

  /** Texels along the hypotenuse x + y = 40 with a value strictly between empty and full. */
  function partialAlongHypotenuse(at: Reds): number {
    let partial = 0;
    for (let x = 0; x < 40; x++) {
      for (const y of [39 - x, 40 - x]) if (y >= 0 && y < SIZE && at(x, y) > 20 && at(x, y) < 235) partial++;
    }
    return partial;
  }

  it('records only the texels a mask allows (what openings above showed), and every one of them it covers', async () => {
    // Allowed: a ring of texels with a hole in it, so both edges and the inside are held.
    const allowed = new Uint8Array(20 * 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) allowed[y * 20 + x] = x >= 6 && x < 14 && y >= 6 && y < 14 ? 0 : 1;
    const within = { x: 10, y: 12, columns: 20, rows: 20, allowed };
    const at = await stamped([{ polygons: [EVERYTHING], clip: null, within }]);
    let outside = 0;
    let missing = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const [mx, my] = [x - within.x, y - within.y];
        const ok = mx >= 0 && my >= 0 && mx < 20 && my < 20 && allowed[my * 20 + mx] === 1;
        if (!ok && at(x, y) > 0) outside++;
        if (ok && at(x, y) < 255) missing++;
      }
    }
    expect({ outside, missing }).toEqual({ outside: 0, missing: 0 });
  });

  it.each([[2048, 602, 1301], [9000, 274, 208]])('keeps within a mask far from the origin of a memory of a %i px map', async (side, x, y) => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const explored = new ExploredTexture(renderer, { width: side, height: side });
    cleanup.push(() => explored.destroy());
    const allowed = new Uint8Array(22 * 13).fill(1);
    explored.add({ polygons: [rect(0, 0, side, side)], clip: null, within: { x, y, columns: 22, rows: 13, allowed } });
    const { pixels } = renderer.extract.pixels({ target: explored.texture });
    let recorded = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 0) recorded++;
    expect(recorded).toBe(22 * 13);
  });

  it('draws a diagonal edge anti-aliased', async () => {
    const at = await stamped([stamp(TRIANGLE)]);
    expect(at(5, 5)).toBe(255);
    expect(at(60, 60)).toBe(0);
    expect(partialAlongHypotenuse(at)).toBeGreaterThanOrEqual(30);
  });

  it('places a stamp exactly where it is, however far from the origin', async () => {
    const at = await stamped([stamp(rect(40, 44, 50, 52))]);
    expect(at(45, 48)).toBe(255);
    expect(at(39, 48)).toBe(0);
    expect(at(51, 48)).toBe(0);
    expect(at(45, 43)).toBe(0);
    expect(at(45, 53)).toBe(0);
    expect(at(5, 5)).toBe(0);
  });

  it('stamps correctly after a large stamp and a small one reuse its scratch', async () => {
    const at = await stamped([stamp(EVERYTHING), stamp(rect(1, 1, 3, 3)), stamp(rect(60, 60, 62, 62))]);
    expect(at(2, 2)).toBe(255);
    expect(at(61, 61)).toBe(255);
    expect(at(30, 30)).toBe(255);
  });

  it('maps a large map down to its texels', async () => {
    const { renderer, explored } = await memory(4096);
    expect(explored.texture.width).toBe(2048);
    explored.add(stamp(rect(1000, 1000, 2000, 2000)));
    const at = reds(renderer, explored);
    expect(at(750, 750)).toBe(255);
    expect(at(498, 750)).toBe(0);
    expect(at(1002, 750)).toBe(0);
  });

  it('draws a map-sized stamp without seams between tiles', async () => {
    const map = 4096;
    const big: Polygon = [p(-50, -50), p(map * 0.9, -50), p(map + 50, map * 0.6), p(map * 0.4, map + 50), p(-50, map * 0.8)];
    const { renderer, explored } = await memory(map);
    explored.add(stamp(big));
    const tiled = reds(renderer, explored);

    const reference = RenderTexture.create({ width: 2048, height: 2048, antialias: true });
    cleanup.push(() => reference.destroy(true));
    const g = new Graphics().poly(big.flatMap((v) => [v.x, v.y])).fill({ color: 0xffffff });
    const root = new Container();
    root.addChild(g);
    renderer.render({ container: root, target: reference, clear: true, clearColor: [0, 0, 0, 0], transform: new Matrix().scale(0.5, 0.5) });
    root.destroy({ children: true });
    const { pixels } = renderer.extract.pixels({ target: reference });

    // Tiles shift the vertices by whole texels in floating point, so an edge texel can land
    // on the other side of one of its four samples: at most one sample (64) and rarely.
    const ONE_SAMPLE = 64;
    let partial = 0;
    let off = 0;
    for (let y = 0; y < 2048; y++) {
      for (let x = 0; x < 2048; x++) {
        const expected = pixels[(y * 2048 + x) * 4]!;
        const error = Math.abs(tiled(x, y) - expected);
        if (expected > 0 && expected < 255) partial++;
        if (error > 1) off++;
        expect(error).toBeLessThanOrEqual(ONE_SAMPLE);
      }
    }
    expect(partial).toBeGreaterThan(2000);
    expect(off).toBeLessThan(partial / 100);

    // A seam would show as a line of errors along the tile border: compare the texels on both sides.
    for (const seam of [TILE, 2 * TILE, 3 * TILE]) {
      let error = 0;
      for (let y = 0; y < 2048; y++) {
        error += Math.abs(tiled(seam - 1, y) - pixels[(y * 2048 + seam - 1) * 4]!);
        error += Math.abs(tiled(seam, y) - pixels[(y * 2048 + seam) * 4]!);
      }
      expect(error / 4096).toBeLessThan(0.5);
    }
  });

  it('keeps one fixed scratch however large or small the stamps are', async () => {
    const renderer = await createTestRenderer(SIZE);
    cleanup.push(() => renderer.destroy());
    const scratch = new StampScratch(renderer);
    cleanup.push(() => scratch.destroy());
    const sizes: number[] = [];
    for (const polygon of [rect(0, 0, 4000, 4000), rect(1, 1, 3, 3), rect(0, 0, 900, 900), rect(5, 5, 6, 6)]) {
      scratch.begin(stamp(polygon));
      const target = scratch.renderTile(1, 0, 0);
      sizes.push(target.width, target.height);
    }
    expect(sizes.every((side) => side === TILE)).toBe(true);
  });

  it('writes nothing outside the clip and smooths the clip edge', async () => {
    const at = await stamped([stamp(EVERYTHING, [TRIANGLE])]);
    expect(at(5, 5)).toBe(255);
    expect(partialAlongHypotenuse(at)).toBeGreaterThanOrEqual(30);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) if (x + y >= 42) expect(at(x, y)).toBe(0);
  });

  it('leaves out the areas of magical darkness, but for what a sense that sees in it perceives there', async () => {
    const darkness = rect(20, 20, 44, 44);
    const everything: ExploredShapes = { polygons: [EVERYTHING], clip: null };
    const none = await stamped([{ ...everything, except: { areas: [darkness], unless: [] } }]);
    expect(none(10, 10)).toBe(255);
    expect(none(32, 32)).toBe(0);
    expect(none(50, 32)).toBe(255);
    // A sense that sees in magical darkness perceives the left half of it.
    const pierced = await stamped([{ ...everything, except: { areas: [darkness], unless: [rect(0, 0, 32, SIZE)] } }]);
    expect(pierced(26, 32)).toBe(255);
    expect(pierced(38, 32)).toBe(0);
    // With a clip: what the stamp records stays inside it, and the darkness the sense sees is recorded as far as the sense reaches.
    const clipped = await stamped([{ polygons: [EVERYTHING], clip: [rect(0, 0, 28, SIZE)], except: { areas: [darkness], unless: [rect(0, 0, 32, SIZE)] } }]);
    expect(clipped(24, 32)).toBe(255);
    expect(clipped(30, 32)).toBe(255);
    expect(clipped(38, 32)).toBe(0);
    expect(clipped(50, 10)).toBe(0);
  });

  it('records the ambient light of a scene with zones where it is lit: the scene without its dark zones, a lit zone in a dark one, and the lights and darkvision in either', async () => {
    const sight = rect(0, 0, 60, SIZE);
    const cave = rect(20, 0, 40, 30);
    // A lit scene with a dark zone: the sight is recorded but for the cave; a torch in the cave is.
    const day = await stamped([{ polygons: [rect(24, 4, 32, 12)], clip: [sight], ambient: { base: true, zones: [{ polygon: cave, lit: false }] } }]);
    expect(day(10, 10)).toBe(255);
    expect(day(36, 20)).toBe(0);
    expect(day(28, 8)).toBe(255);
    expect(day(50, 40)).toBe(255);
    // Nothing past the sight, lit or not.
    expect(day(62, 10)).toBe(0);
    // A dark scene with a lit zone, and a second, dark one over a part of it.
    const night = await stamped([{ polygons: [], clip: [sight], ambient: { base: false, zones: [{ polygon: cave, lit: true }, { polygon: rect(20, 0, 40, 10), lit: false }] } }]);
    expect(night(10, 10)).toBe(0);
    expect(night(30, 20)).toBe(255);
    expect(night(30, 5)).toBe(0);
    // Magical darkness takes its area out of a lit zone too.
    const dark = await stamped([{ polygons: [], clip: [sight], ambient: { base: false, zones: [{ polygon: cave, lit: true }] }, except: { areas: [rect(20, 14, 40, 22)], unless: [] } }]);
    expect(dark(30, 18)).toBe(0);
    expect(dark(30, 26)).toBe(255);
  });

  it('keeps the larger of overlapping stamps texel by texel', async () => {
    const first = await stamped([stamp(TRIANGLE)]);
    const second = await stamped([stamp(OTHER)]);
    const both = await stamped([stamp(TRIANGLE), stamp(OTHER)]);
    const reversed = await stamped([stamp(OTHER), stamp(TRIANGLE)]);
    let overlapped = 0;
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        const expected = Math.max(first(x, y), second(x, y));
        if (first(x, y) > 0 && second(x, y) > 0) overlapped++;
        expect(Math.abs(both(x, y) - expected)).toBeLessThanOrEqual(1);
        expect(Math.abs(reversed(x, y) - expected)).toBeLessThanOrEqual(1);
      }
    }
    expect(overlapped).toBeGreaterThan(50);
  });

  it('does not thicken an edge by stamping it again', async () => {
    const once = await stamped([stamp(TRIANGLE)]);
    const twice = await stamped([stamp(TRIANGLE), stamp(TRIANGLE)]);
    const nudged = await stamped([stamp(TRIANGLE), stamp([p(0, 0), p(40.4, 0), p(0, 40.4)])]);
    const nudgedAlone = await stamped([stamp([p(0, 0), p(40.4, 0), p(0, 40.4)])]);
    for (let x = 0; x < SIZE; x++) {
      for (let y = 0; y < SIZE; y++) {
        expect(Math.abs(twice(x, y) - once(x, y))).toBeLessThanOrEqual(1);
        expect(Math.abs(nudged(x, y) - Math.max(once(x, y), nudgedAlone(x, y)))).toBeLessThanOrEqual(1);
      }
    }
  });

  it('forgets everything on clear', async () => {
    const { renderer, explored } = await memory();
    explored.add(stamp(EVERYTHING));
    expect(reds(renderer, explored)(10, 10)).toBe(255);
    explored.clear();
    const at = reds(renderer, explored);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y += 5) expect(at(x, y)).toBe(0);
  });

  it('keeps an anti-aliased edge through repeated saves and loads', async () => {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
    const { renderer, explored } = await memory();
    explored.add(stamp(TRIANGLE));
    const original = reds(renderer, explored);
    expect(partialAlongHypotenuse(original)).toBeGreaterThanOrEqual(30);

    let current = explored;
    for (let cycle = 0; cycle < 3; cycle++) {
      const next = new ExploredTexture(renderer, { width: SIZE, height: SIZE });
      cleanup.push(() => next.destroy());
      await next.load(saveExploredMask(current.toCanvas()));
      current = next;
    }
    const restored = reds(renderer, current);
    for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) expect(Math.abs(restored(x, y) - original(x, y))).toBeLessThanOrEqual(2);
  });
});
