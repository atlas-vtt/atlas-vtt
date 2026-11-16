import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';
import type { TokenEntity } from '../../src/app/types';
import { openLitView, type LitView } from '../helpers/litView';

vi.mock('events', async () => import('eventemitter3'));

const PANE = 700;
const MAP = 1400;
const TORCH = { bright: 4, dim: 8, color: '#ffc080', intensity: 1, animation: 'none' };

function canvasPixels(view: LitView): Uint8ClampedArray {
  const { app } = view;
  app.renderer.render({ container: app.stage });
  const copy = new OffscreenCanvas(app.canvas.width, app.canvas.height).getContext('2d', { willReadFrequently: true })!;
  copy.drawImage(app.canvas, 0, 0);
  return new Uint8ClampedArray(copy.getImageData(0, 0, app.canvas.width, app.canvas.height).data);
}

const brightness = (data: Uint8ClampedArray, i: number): number => Math.max(data[i]!, data[i + 1]!, data[i + 2]!);

/** Places near white in one frame and much darker in the frames either side, which agree: a dot that flashes and goes. */
function flashes(before: Uint8ClampedArray, now: Uint8ClampedArray, after: Uint8ClampedArray, width: number): string[] {
  const found: string[] = [];
  for (let i = 0; i < now.length; i += 4) {
    const [was, is, next] = [brightness(before, i), brightness(now, i), brightness(after, i)];
    if (is > 190 && is - Math.max(was, next) > 45 && Math.abs(was - next) < 14) found.push(`${(i / 4) % width},${Math.floor(i / 4 / width)}: ${was} ${is} ${next}`);
  }
  return found;
}

/**
 * A torch carried over a dungeon's walls at Saver, where a light is a fan of triangles added into
 * the light map. Where its outline runs along a ray from a wall's corner, a plain fan's triangles
 * on either side end on two edges a rasteriser does not lay on one line: a texel between them got
 * the light twice, a bright dot on the floor for as long as the torch stood just there.
 */
describe('a torch carried at Saver', () => {
  const open: LitView[] = [];
  afterEach(() => { while (open.length) open.pop()!.dispose(); });

  it.each([[5, 35], [5, 0], [1.37, 35]])('flashes no dots at %s px a step along a line %s px into a cell', async (stepPx, line) => {
    const view = await openLitView({ pane: { width: PANE, height: PANE }, map: MAP, floor: 0xf0e8d8, quality: LIGHTING_QUALITY.saver });
    open.push(view);
    const c = MAP / 2;
    view.viewport.moveCenter(c, c);
    const state = view.store.getState();
    state.setSceneLighting({ enabled: true, ambient: 0 });
    state.setGMView(false);
    let seed = 7;
    const random = (): number => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    for (let i = 0; i < 90; i++) {
      const x = c + Math.floor(random() * 14 - 7) * 70;
      const y = c + Math.floor(random() * 14 - 7) * 70;
      const length = Math.floor(random() * 3 + 1) * 70;
      state.addWall({ type: 'solid', p1: { x, y }, p2: random() < 0.5 ? { x: x + length, y } : { x, y: y + length } });
    }
    const token = (id: string, x: number, y: number): TokenEntity => ({ id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision: { enabled: true, range: 500 }, light: TORCH }) as unknown as TokenEntity;
    const frames: Uint8ClampedArray[] = [];
    const dots: string[] = [];
    for (let step = 0; step < 110; step++) {
      const tokens = { carried: token('carried', c - 245 + step * stepPx, c - 140 + line), resting: token('resting', c + line, c + line) };
      view.store.setState((s) => ({ objects: { ...s.objects, tokens } }));
      view.displayFrames(2);
      frames.push(canvasPixels(view));
      if (frames.length < 3) continue;
      // A torch exactly on a wall's line lights both its sides for that frame, as the rule says.
      const onWallLine = (c - 245 + (step - 1) * stepPx) % 70 === 0;
      if (!onWallLine) dots.push(...flashes(frames[0]!, frames[1]!, frames[2]!, view.app.canvas.width).map((dot) => `step ${step - 1} ${dot}`));
      frames.shift();
    }
    expect(dots).toEqual([]);
  }, 120_000);
});
