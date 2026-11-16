import type { WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExploredShapes } from '../../../../vision/exploredShapes';
import type { Polygon } from '../../../../vision/visibility';
import { ExploredTexture } from '../../ExploredTexture';
import { saveExploredMask } from '../../exploredMaskSaving';
import { createTestRenderer } from './gpuTestUtils';

const p = (x: number, y: number): { x: number; y: number } => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Polygon => [p(x0, y0), p(x1, y0), p(x1, y1), p(x0, y1)];
const stamp = (polygon: Polygon): ExploredShapes => ({ polygons: [polygon], clip: null });

describe('explored memory through saves and restores', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
    vi.unstubAllGlobals();
  });

  const MAP = 2048;
  /** A room of 9,856 texels, a sliver of ten, and a triangle with a slanted edge. */
  const SHAPES = [rect(200, 300, 312, 388), rect(600, 100, 610, 101), [p(900, 900), p(1300, 950), p(1000, 1400)] as Polygon];

  function stubCreateEl(): void {
    vi.stubGlobal('createEl', (tag: string, options?: { attr?: Record<string, string> }): HTMLElement => {
      const el = document.createElement(tag);
      for (const [name, value] of Object.entries(options?.attr ?? {})) el.setAttribute(name, value);
      return el;
    });
  }

  async function large(): Promise<{ renderer: WebGLRenderer; explored: ExploredTexture; texels: () => Uint8ClampedArray }> {
    stubCreateEl();
    const renderer = await createTestRenderer(64);
    cleanup.push(() => renderer.destroy());
    // Larger than older versions saved a mask at (1,024 px), so those were scaled.
    const explored = new ExploredTexture(renderer, { width: MAP, height: MAP });
    cleanup.push(() => explored.destroy());
    for (const shape of SHAPES) explored.add(stamp(shape));
    return { renderer, explored, texels: () => renderer.extract.pixels({ target: explored.texture }).pixels };
  }

  it('keeps no decoded mask on the graphics card once it is drawn', async () => {
    const { renderer, explored } = await large();
    const mask = saveExploredMask(explored.toCanvas());
    await explored.load(mask);
    const managed = (): number => renderer.texture.managedTextures.filter((source) => source && !source.destroyed).length;
    const before = managed();
    for (let i = 0; i < 3; i++) await explored.load(mask);
    expect(managed()).toBe(before);
  });

  it('is the same after twenty saves and restores: no texel lost, none gained, none changed', { timeout: 120_000 }, async () => {
    const { explored, texels } = await large();
    const original = texels().slice();
    let covered = 0;
    for (let i = 0; i < original.length; i += 4) if (original[i]! > 0) covered++;
    expect(covered).toBeGreaterThan(9856 + 10 + 80_000);
    const results: number[][] = [];
    for (let cycle = 1; cycle <= 20; cycle++) {
      await explored.load(saveExploredMask(explored.toCanvas()));
      if (cycle !== 1 && cycle !== 10 && cycle !== 20) continue;
      const now = texels();
      let lost = 0, gained = 0, changed = 0;
      for (let i = 0; i < original.length; i += 4) {
        if (original[i]! > 0 && now[i] === 0) lost++;
        else if (original[i] === 0 && now[i]! > 0) gained++;
        else if (original[i] !== now[i]) changed++;
      }
      results.push([cycle, lost, gained, changed]);
    }
    console.info(`explored memory of ${covered} texels after 1, 10 and 20 saves and restores, texels [cycle, lost, gained, changed]: ${JSON.stringify(results)}`);
    expect(results).toEqual([[1, 0, 0, 0], [10, 0, 0, 0], [20, 0, 0, 0]]);
  });

  it('still loads a mask an older Atlas saved at half its size, with edges where they were and nothing spread past them', async () => {
    const { explored, texels } = await large();
    const original = texels().slice();
    // As older versions saved it: at 1,024 px.
    const small = document.createElement('canvas');
    small.width = MAP / 2;
    small.height = MAP / 2;
    small.getContext('2d')!.drawImage(explored.toCanvas(), 0, 0, MAP / 2, MAP / 2);
    await explored.load(small.toDataURL('image/png'));
    const now = texels();
    const at = (pixels: Uint8ClampedArray, x: number, y: number): number => pixels[(y * MAP + x) * 4]!;
    // The room is there, and nothing two texels past its edges; inside it nothing is missing two texels in.
    expect(at(now, 250, 340)).toBe(255);
    for (let x = 196; x <= 316; x += 4) for (const y of [297, 390]) expect([x, y, at(now, x, y)]).toEqual([x, y, 0]);
    for (let y = 296; y <= 392; y += 4) for (const x of [197, 314]) expect([x, y, at(now, x, y)]).toEqual([x, y, 0]);
    for (let x = 204; x <= 308; x += 4) for (const y of [303, 385]) expect([x, y, at(now, x, y)]).toEqual([x, y, 255]);
    expect(at(original, 250, 340)).toBe(255);
  });

  it('adds a saved memory to what it holds, texel by texel the larger of the two (a player\'s page taking the GM\'s)', async () => {
    const { renderer, explored, texels } = await large();
    const elsewhere = new ExploredTexture(renderer, { width: MAP, height: MAP });
    cleanup.push(() => elsewhere.destroy());
    elsewhere.add(stamp(rect(1500, 1500, 1600, 1600)));
    elsewhere.add(stamp(rect(200, 300, 260, 388)));
    const theirs = saveExploredMask(elsewhere.toCanvas());
    const before = texels().slice();
    explored.drawOver(await explored.decode(theirs));
    const now = texels();
    const other = renderer.extract.pixels({ target: elsewhere.texture }).pixels;
    let differ = 0;
    for (let i = 0; i < now.length; i += 4) if (now[i] !== Math.max(before[i]!, other[i]!)) differ++;
    expect(differ).toBe(0);
    expect(now[(1550 * MAP + 1550) * 4]).toBe(255);
    expect(now[(340 * MAP + 300) * 4]).toBe(255);
  });
});
