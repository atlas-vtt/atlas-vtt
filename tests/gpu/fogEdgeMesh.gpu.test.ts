import '../setup/obsidianDom';
import { Application, Container, RenderTexture, Sprite, Texture } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { FogEdgeMesh } from '../../src/app/pixi/fog/fogEdgeMesh';
import { fogEdgeBlur } from '../../src/app/fog/fogEdge';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';
import { fogScenes } from '../helpers/fogCoverageScene';

/**
 * The crackled fog edge is cut on the screen: as sharp as the screen's pixels at any zoom, where the
 * half-resolution fog canvas alone would be as coarse as itself.
 */
const SIZE = 360;
const WORLD = 400;
const SCALE = 0.5;
const EDGE = 80;
const ZOOM = 3;
/** Where `rampFog` turns from solid fog to open ground, in canvas pixels. */
const RAMP = [70, 130] as const;

describe('the fog edge\'s mesh', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  /** The fog canvas as the compositor leaves it: fog over the left half, blurred over the edge. */
  function blurredFog(): HTMLCanvasElement {
    const side = WORLD * SCALE;
    const source = document.createElement('canvas');
    source.width = side;
    source.height = side;
    source.getContext('2d')!.fillStyle = '#20242a';
    source.getContext('2d')!.fillRect(0, 0, side / 2, side);
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.filter = `blur(${fogEdgeBlur(EDGE) * SCALE}px)`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = 'none';
    return canvas;
  }

  /** A plain ramp: solid fog up to `RAMP[0]` canvas pixels, open ground from `RAMP[1]`, in 8 bits. */
  function rampFog(): HTMLCanvasElement {
    const side = WORLD * SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const image = ctx.createImageData(side, side);
    for (let y = 0; y < side; y++) {
      for (let x = 0; x < side; x++) {
        const p = (y * side + x) * 4;
        image.data.set([32, 36, 42, Math.round(255 * Math.min(1, Math.max(0, (RAMP[1] - x) / (RAMP[1] - RAMP[0]))))], p);
      }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  async function stage(canvas: HTMLCanvasElement, opacity = 1, zoom = ZOOM, shift = 0): Promise<{ app: Application; alphaAt: (x: number, y: number) => number; originX: number }> {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, resolution: 1, preference: 'webgl', antialias: false, autoStart: false, preserveDrawingBuffer: true, backgroundAlpha: 0 });
    cleanup.push(() => app.destroy(true, { children: true }));
    document.body.appendChild(app.canvas);
    // Zoomed in on the edge, as a GM close up or a player window shows it
    const world = new Container();
    world.scale.set(zoom);
    world.position.set(SIZE / 2 - zoom * (WORLD / 2) + shift, SIZE / 2 - zoom * (WORLD / 2) + shift);
    const fog = new Sprite(Texture.from(canvas));
    fog.width = WORLD;
    fog.height = WORLD;
    fog.alpha = opacity;
    world.addChild(fog);
    new FogEdgeMesh(fog, { style: 'crackle', width: EDGE });
    app.stage.addChild(world);
    app.render();
    const gl = app.canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { app, alphaAt: (x, y) => pixels[((SIZE - 1 - y) * SIZE + x) * 4 + 3]!, originX: world.position.x };
  }

  it('cuts the edge at the screen\'s pixels, crisp and broken, and leaves solid fog and open ground alone', async () => {
    const { app, alphaAt } = await stage(blurredFog());
    await page.screenshot({ path: '__screenshots__/fog-crackle-screen.png', element: app.canvas });
    let soft = 0;
    let all = 0;
    let changes = 0;
    for (let y = 0; y < SIZE; y += 2) {
      for (let x = 1; x < SIZE; x++) {
        const alpha = alphaAt(x, y);
        all++;
        if (alpha > 25 && alpha < 230) soft++;
        if ((alpha > 127) !== (alphaAt(x - 1, y) > 127)) changes++;
      }
    }
    // Cracks, not a fade: all of this view lies in the blurred edge, yet few pixels are in between
    // fog and ground (the antialiasing), and fog turns to ground and back in many places
    expect(soft / all).toBeLessThan(0.08);
    expect(changes).toBeGreaterThan(60);
    // A canvas texel spans three screen pixels here: the cut must change within texels, not only between them
    let withinTexel = 0;
    for (let y = 0; y < SIZE; y += 2) {
      for (let x = 1; x < SIZE; x++) if (x % ZOOM !== 0 && (alphaAt(x, y) > 127) !== (alphaAt(x - 1, y) > 127)) withinTexel++;
    }
    expect(withinTexel).toBeGreaterThan(changes / 3);
  });

  // Solid fog and open ground lie beyond the cut's band, wherever the 8-bit ends of the blur fall under
  // the screen's pixels: the cut once stopped short at them, a seam that moved with every pan
  it('leaves solid fog and open ground whole, at every place of the edge under the pixels', async () => {
    const canvas = rampFog();
    const texels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const texel = (tx: number): number => texels[Math.min(canvas.width - 1, Math.max(0, tx)) * 4 + 3]!;
    const zoom = 1.5;
    let checked = 0;
    const stray: string[] = [];
    for (const shift of [0, 0.25, 0.5, 0.75]) {
      const { alphaAt, originX } = await stage(canvas, 1, zoom, shift);
      for (let x = 0; x < SIZE; x++) {
        // The two texels the pixel's middle is filtered between (the ramp runs along x only)
        const left = Math.floor(((x + 0.5 - originX) / zoom) * SCALE - 0.5);
        const solid = texel(left) >= 250 && texel(left + 1) >= 250;
        const open = texel(left) <= 5 && texel(left + 1) <= 5;
        if (!solid && !open) continue;
        for (let y = 0; y < SIZE; y++) {
          checked++;
          const alpha = alphaAt(x, y);
          if (solid ? alpha < 250 : alpha > 5) stray.push(`${shift}: ${x},${y} ${alpha}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(SIZE * SIZE);
    expect(stray.slice(0, 10)).toEqual([]);
  });

  it('keeps the GM\'s fog opacity through the cut: the same cracks, half as dense', async () => {
    const full = await stage(blurredFog(), 1);
    const half = await stage(blurredFog(), 0.5);
    let checked = 0;
    for (let y = 0; y < SIZE; y += 7) {
      for (let x = 0; x < SIZE; x += 7) {
        const alpha = full.alphaAt(x, y);
        // The antialiased edge moves by a rounding of the halved alpha; fog and ground do not
        if (alpha !== 0 && alpha !== 255) continue;
        expect(Math.abs(half.alphaAt(x, y) - alpha / 2)).toBeLessThan(3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(2000);
  });

  // Soft and crackled are one path: soft through the mesh is the blur the sprite would draw
  it('draws a soft edge as the sprite draws the blur, at full and half opacity', async () => {
    for (const opacity of [1, 0.5]) {
      const render = async (mesh: boolean): Promise<Uint8Array> => {
        const app = new Application();
        await app.init({ width: SIZE, height: SIZE, resolution: 1, preference: 'webgl', antialias: false, autoStart: false, preserveDrawingBuffer: true, backgroundAlpha: 0 });
        cleanup.push(() => app.destroy(true, { children: true }));
        const fog = new Sprite(Texture.from(blurredFog()));
        fog.width = SIZE;
        fog.height = SIZE;
        fog.alpha = opacity;
        app.stage.addChild(fog);
        if (mesh) new FogEdgeMesh(fog, { style: 'soft', width: EDGE });
        app.render();
        const pixels = new Uint8Array(SIZE * SIZE * 4);
        app.canvas.getContext('webgl2')!.readPixels(0, 0, SIZE, SIZE, 0x1908, 0x1401, pixels);
        return pixels;
      };
      const sprite = await render(false);
      const mesh = await render(true);
      for (let i = 3; i < sprite.length; i += 4 * 97) expect(Math.abs(sprite[i]! - mesh[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('follows its sprite: hidden, shown again, and drawn into a texture as the players\' frame is', async () => {
    const app = new Application();
    await app.init({ width: SIZE, height: SIZE, resolution: 1, preference: 'webgl', antialias: false, autoStart: false, preserveDrawingBuffer: true, backgroundAlpha: 0 });
    cleanup.push(() => app.destroy(true, { children: true }));
    const fog = new Sprite(Texture.from(blurredFog()));
    fog.width = SIZE;
    fog.height = SIZE;
    app.stage.addChild(fog);
    const crackle = new FogEdgeMesh(fog, { style: 'crackle', width: EDGE });
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanup.push(() => target.destroy(true));
    const fogged = (): number => {
      app.renderer.render({ container: app.stage, target, clear: true });
      const { pixels } = app.renderer.extract.pixels(target);
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 127) count++;
      return count;
    };
    const shown = fogged();
    // The fog's left half, cut, and blurred at the picture's own borders too: a fifth of it or so
    expect(shown / (SIZE * SIZE)).toBeGreaterThan(0.1);
    expect(shown / (SIZE * SIZE)).toBeLessThan(0.5);
    fog.visible = false;
    expect(fogged()).toBe(0);
    fog.visible = true;
    expect(fogged()).toBe(shown);
    // Taken off, the sprite draws itself again: the blur uncut
    crackle.destroy();
    expect(fog.renderable).toBe(true);
    expect(fogged()).toBeGreaterThan(0);
  });
});

describe('the fog with a crackled edge', () => {
  const { scene } = fogScenes();
  const rect = (id: string, x: number, width: number): FogRectangleFill =>
    ({ id, timestamp: 1, kind: 'fog', type: 'rectangle', x, y: 0, width, height: 128, isErasing: false });

  it('breaks the edge in the players\' picture and hides a map fogged whole up to its rim', async () => {
    const s = await scene({ half: rect('half', 0, 64) });
    s.showMapImage({ x: 0, y: 0, width: 128, height: 128 });
    s.fog.setEdge({ style: 'crackle', width: 40 });
    const row = Array.from({ length: 128 }, (_, x) => s.read(x, 64));
    expect(row.slice(0, 4).every((floor) => floor === 0)).toBe(true);
    expect(row.slice(-4).every((floor) => floor === 255)).toBe(true);
    // Cracks, not a fade: over the edge's width most of the row is fog or floor
    expect(row.filter((floor) => floor > 25 && floor < 230).length).toBeLessThan(row.length / 4);
    s.setFog({ whole: rect('whole', 0, 128) });
    for (const [x, y] of [[0, 0], [127, 0], [0, 127], [127, 127], [64, 0], [0, 64]] as const) expect(s.read(x, y)).toBe(0);
  });

  it('gives the sprite back when the edge turns soft, and fades again', async () => {
    const s = await scene({ half: rect('half', 0, 64) });
    s.showMapImage({ x: 0, y: 0, width: 128, height: 128 });
    s.fog.setEdge({ style: 'crackle', width: 40 });
    s.fog.setEdge({ style: 'soft', width: 8 });
    const middle = s.read(64, 64);
    expect(middle).toBeGreaterThan(80);
    expect(middle).toBeLessThan(180);
    s.fog.setEdge({ style: 'crackle', width: 0 });
    expect(s.read(4, 64)).toBe(0);
  });
});
