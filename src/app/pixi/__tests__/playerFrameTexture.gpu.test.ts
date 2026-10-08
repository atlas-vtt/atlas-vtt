import { Application, Container, Graphics, RenderTexture, Sprite, Texture, TexturePool, type Renderer, type WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerFrameTexture } from '../PlayerFrameTexture';
import { LightingEngine } from '../lighting/engine/LightingEngine';
import type { EngineScene } from '../lighting/engine/types';
import { resetContext } from '../lighting/__tests__/rendererHarness';
import type { FramePiece, PlayerFrame } from '../../types/playerFrame';
import { SEES_ALL } from '../../vision/sight';
import { Matrix } from 'pixi.js';

const BACKGROUND = 0x204060;
const MAP = 1024;

interface Rig {
  app: Application;
  renderer: Renderer;
  frames: PlayerFrameTexture;
  world: Container;
  /** Points the camera for a render of that logical size. */
  camera(frame: PlayerFrame): void;
  /** The GM's camera, on the pane. */
  ownCamera(): void;
  /** The players' canvas after one mirrored frame, pixel by pixel, and how many pieces brought it there. */
  mirrored(frame: PlayerFrame): { pixels: Uint8ClampedArray; pieces: FramePiece[] };
  /** The same frame rendered into a texture and read back. */
  readBack(frame: PlayerFrame): Uint8ClampedArray;
  /** The GM's canvas after its own render. */
  ownCanvas(): Uint8ClampedArray;
}

/** A value per pixel that differs from every neighbour's: a shift or an average of two pixels shows. */
function noise(size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  let seed = 12345;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    image.data[i] = seed >>> 24;
    image.data[i + 1] = (seed >>> 16) & 255;
    image.data[i + 2] = (seed >>> 8) & 255;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

function frameOf(width: number, height: number, resolution = 1, antialias = false): PlayerFrame {
  return { width, height, resolution, antialias, centerX: MAP / 2, centerY: MAP / 2, scale: 0.4 };
}

function rgbOf(pixels: Uint8ClampedArray | Uint8Array): number[] {
  const rgb: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) rgb.push(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!);
  return rgb;
}

/** The first pixel at which two pictures differ, for a message that says where. */
function firstDifference(a: number[], b: number[], width: number): string | null {
  if (a.length !== b.length) return `sizes differ: ${a.length / 3} and ${b.length / 3} pixels`;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      const pixel = Math.floor(i / 3);
      return `pixel (${pixel % width}, ${Math.floor(pixel / width)}): ${a.slice(pixel * 3, pixel * 3 + 3).join(',')} and ${b.slice(pixel * 3, pixel * 3 + 3).join(',')}`;
    }
  }
  return null;
}

describe('a players\' frame of its own size, brought to a 2D canvas through the view\'s canvas', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  interface Options { pane?: [number, number]; resolution?: number; samples?: boolean; preference?: 'webgl' | 'canvas' }

  /** A map view's renderer as the plugin sets it up: `samples` is a canvas of a view made while lighting is off. */
  async function setup({ pane = [200, 120], resolution = 1, samples = false, preference = 'webgl' }: Options = {}): Promise<Rig> {
    const app = new Application();
    await app.init({
      width: pane[0], height: pane[1], resolution, preference, antialias: true, useBackBuffer: !samples, autoStart: false,
      backgroundColor: BACKGROUND, backgroundAlpha: 1, autoDensity: true,
    });
    expect(app.renderer.name).toBe(preference);
    const { renderer } = app;
    const frames = new PlayerFrameTexture(renderer);
    const world = new Container();
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(MAP, MAP);
    floor.tint = 0x808890;
    // Thin slanted lines and small shapes over the whole map: every piece's seam crosses some
    const marks = new Graphics();
    for (let i = 0; i < 40; i++) marks.moveTo(i * 26, 0).lineTo(MAP - i * 13, MAP).stroke({ width: 1.5, color: 0xffffff - i * 0x050301 });
    for (let i = 0; i < 60; i++) marks.circle((i * 97) % MAP, (i * 61) % MAP, 6 + (i % 5)).fill(0x102030 + i * 0x030507);
    world.addChild(floor, marks);
    app.stage.addChild(world);
    const texture = preference === 'webgl' ? noise(256) : null;
    // In screen space, a texel to a pixel of the frame: set per frame
    const grain = texture ? new Sprite(texture) : null;
    if (grain) {
      grain.alpha = 0.5;
      app.stage.addChild(grain);
    }
    cleanup.push(() => {
      frames.destroy();
      texture?.destroy(true);
      app.destroy(true, { children: true });
    });
    const camera = (frame: PlayerFrame): void => {
      world.scale.set(frame.scale);
      world.position.set(frame.width / frame.resolution / 2 - frame.centerX * frame.scale, frame.height / frame.resolution / 2 - frame.centerY * frame.scale);
      grain?.scale.set(1 / frame.resolution);
    };
    const ownCamera = (): void => camera(frameOf(pane[0] * resolution, pane[1] * resolution, resolution));
    const target = document.createElement('canvas');
    const context = target.getContext('2d', { willReadFrequently: true })!;
    return {
      app, renderer, frames, world, camera, ownCamera,
      mirrored(frame): { pixels: Uint8ClampedArray; pieces: FramePiece[] } {
        target.width = frame.width;
        target.height = frame.height;
        const pieces: FramePiece[] = [];
        camera(frame);
        frames.render(app.stage, frame);
        frames.copy((piece) => {
          pieces.push({ ...piece });
          context.drawImage(piece.image, piece.x, piece.y, piece.width, piece.height, piece.left, piece.top, piece.width, piece.height);
        });
        // As the mirror leaves it: the GM's own render follows in the same task
        ownCamera();
        renderer.render({ container: app.stage });
        return { pixels: context.getImageData(0, 0, frame.width, frame.height).data, pieces };
      },
      readBack(frame): Uint8ClampedArray {
        const texture = RenderTexture.create({ width: frame.width / frame.resolution, height: frame.height / frame.resolution, resolution: frame.resolution, antialias: frame.antialias });
        camera(frame);
        renderer.render({ container: app.stage, target: texture, clear: true, clearColor: renderer.background.colorRgba });
        const { pixels } = renderer.extract.pixels({ target: texture });
        texture.destroy(true);
        ownCamera();
        return pixels;
      },
      ownCanvas(): Uint8ClampedArray {
        ownCamera();
        renderer.render({ container: app.stage });
        const copy = new OffscreenCanvas(renderer.canvas.width, renderer.canvas.height).getContext('2d', { willReadFrequently: true })!;
        copy.drawImage(renderer.canvas, 0, 0);
        return copy.getImageData(0, 0, renderer.canvas.width, renderer.canvas.height).data;
      },
    };
  }

  function expectSame(rig: Rig, frame: PlayerFrame): FramePiece[] {
    const expected = rgbOf(rig.readBack(frame));
    const { pixels, pieces } = rig.mirrored(frame);
    expect(pixels.length).toBe(frame.width * frame.height * 4);
    expect(firstDifference(rgbOf(pixels), expected, frame.width)).toBeNull();
    // The picture is no blank: the comparison means something
    expect(new Set(expected.slice(0, 3000)).size).toBeGreaterThan(20);
    return pieces;
  }

  describe.each([
    { name: 'a canvas without samples (a view that lights its scenes)', samples: false },
    { name: 'a canvas with samples (a view made while lighting is off)', samples: true },
  ])('on $name', ({ samples }) => {
    it.each([
      { name: 'larger than the pane in both directions: pieces with seams', size: [500, 333], pieces: 9 },
      { name: 'an exact multiple of the pane', size: [400, 240], pieces: 4 },
      { name: 'smaller than the pane', size: [100, 50], pieces: 1 },
      { name: 'the pane\'s own size', size: [200, 120], pieces: 1 },
      { name: 'wider only', size: [777, 100], pieces: 4 },
      { name: 'a pixel larger than the pane', size: [201, 121], pieces: 4 },
    ])('copies a frame $name pixel for pixel', async ({ size, pieces }) => {
      const rig = await setup({ samples });
      expect(expectSame(rig, frameOf(size[0]!, size[1]!))).toHaveLength(pieces);
    });

    it.each([1.25, 1.5, 2])('copies pixel for pixel from a canvas at a pixel ratio of %s', async (resolution) => {
      const rig = await setup({ samples, resolution, pane: [173, 97] });
      const pieces = expectSame(rig, frameOf(640, 360));
      // Pieces are whole canvas pixels, also where the pane has no whole number of them
      for (const piece of pieces) expect([piece.left % rig.renderer.canvas.width, piece.top % rig.renderer.canvas.height]).toEqual([0, 0]);
    });

    it.each([
      { name: 'smoothed', frame: frameOf(500, 333, 1, true) },
      { name: 'with two thirds of a pixel to a point (a capped frame)', frame: frameOf(500, 333, 2 / 3) },
      { name: 'with one and a half pixels to a point, smoothed', frame: frameOf(501, 334, 1.5, true) },
      { name: 'with two pixels to a point', frame: frameOf(500, 334, 2) },
    ])('copies a frame $name pixel for pixel', async ({ frame }) => {
      const rig = await setup({ samples });
      expectSame(rig, frame);
    });

    it('leaves the GM\'s canvas exactly as it is without a mirrored frame', async () => {
      const rig = await setup({ samples });
      const before = rgbOf(rig.ownCanvas());
      rig.mirrored(frameOf(500, 333));
      rig.mirrored(frameOf(640, 360, 1, true));
      const after = rgbOf(rig.ownCanvas());
      expect(firstDifference(after, before, rig.renderer.canvas.width)).toBeNull();
      // And the copy left the back buffer as the view uses it
      const webgl = rig.renderer as WebGLRenderer;
      expect(webgl.backBuffer.useBackBuffer).toBe(!samples);
    });
  });

  it('copies a lit frame pixel for pixel: the composite reads the scene in the texture, past the back buffer', async () => {
    const rig = await setup();
    const engine = new LightingEngine(rig.renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.setMode('player');
    const scene: EngineScene = {
      bounds: { width: MAP, height: MAP }, albedo: null, sight: SEES_ALL, sightRadius: 20, ambient: 0.1,
      walls: [{ id: 'w', kind: 'wall', type: 'solid', p1: { x: 300, y: 200 }, p2: { x: 700, y: 520 } }],
      lights: [{ key: 'l', x: 460, y: 540, bright: 120, dim: 260, flame: 10, color: [1, 0.8, 0.6], intensity: 1, animation: 'none' }],
    };
    engine.update(scene);
    engine.flush();
    rig.world.addChild(engine.layer);
    engine.layer.onRender = (): void => {
      const { scale, position } = rig.world;
      engine.setView(new Matrix(scale.x, 0, 0, scale.y, position.x, position.y).invert(), scale.x);
    };
    // Also as a capped frame has it, with fewer pixels than points, and smoothed
    for (const other of [frameOf(500, 333, 2 / 3), frameOf(500, 334, 2), frameOf(500, 333, 1, true)]) {
      const lit = rgbOf(rig.readBack(other));
      expect(firstDifference(rgbOf(rig.mirrored(other).pixels), lit, other.width)).toBeNull();
    }
    const frame = frameOf(500, 333);
    const expected = rgbOf(rig.readBack(frame));
    const { pixels } = rig.mirrored(frame);
    expect(firstDifference(rgbOf(pixels), expected, frame.width)).toBeNull();
    // Lit and dark: near the light the floor is bright, far from it dark
    const at = (x: number, y: number): number => pixels[(y * frame.width + x) * 4]!;
    const lit = (460 - MAP / 2) * frame.scale + 250, row = Math.round((560 - MAP / 2) * frame.scale + 166);
    expect(at(Math.round(lit), row)).toBeGreaterThan(at(20, 20) + 30);
    // The GM's lit canvas is what it is without the mirror
    const own = rgbOf(rig.ownCanvas());
    rig.mirrored(frame);
    expect(firstDifference(rgbOf(rig.ownCanvas()), own, rig.renderer.canvas.width)).toBeNull();
  });

  it('hands out nothing from a canvas without pixels', async () => {
    const rig = await setup();
    const frame = frameOf(300, 200);
    rig.camera(frame);
    rig.frames.render(rig.app.stage, frame);
    const { width, height } = rig.renderer.canvas;
    rig.renderer.canvas.width = 0;
    const copy = vi.fn();
    rig.frames.copy(copy);
    expect(copy).not.toHaveBeenCalled();
    rig.renderer.canvas.width = width;
    rig.renderer.canvas.height = height;
  });

  it('copies a frame on PIXI\'s Canvas renderer in one piece, pixel for pixel', async () => {
    const rig = await setup({ preference: 'canvas' });
    for (const frame of [frameOf(500, 333), frameOf(100, 50), frameOf(640, 360, 1.5)]) {
      const expected = rgbOf(rig.readBack(frame));
      const { pixels, pieces } = rig.mirrored(frame);
      expect(pieces).toHaveLength(1);
      expect(pieces[0]!.image).not.toBe(rig.renderer.canvas);
      expect(firstDifference(rgbOf(pixels), expected, frame.width)).toBeNull();
    }
    const own = rgbOf(rig.ownCanvas());
    rig.mirrored(frameOf(500, 333));
    expect(firstDifference(rgbOf(rig.ownCanvas()), own, rig.renderer.canvas.width)).toBeNull();
  });

  /** MB of the textures the renderer manages now. */
  function heldMb(renderer: Renderer): number {
    let bytes = 0;
    for (const source of (renderer as WebGLRenderer).texture.managedTextures) {
      if (source) bytes += source.pixelWidth * source.pixelHeight * 4 * (source.antialias ? 5 : 1);
    }
    return Math.round(bytes / 1e5) / 10;
  }

  function textureCount(renderer: Renderer): number {
    return (renderer as WebGLRenderer).texture.managedTextures.filter(Boolean).length;
  }

  /** A blend filter over the map, as the lighting composite is one: it takes pooled textures of the frame's size. */
  function withFilter(rig: Rig): LightingEngine {
    const engine = new LightingEngine(rig.renderer);
    cleanup.push(() => engine.destroy());
    engine.setEnabled(true);
    engine.update({ bounds: { width: MAP, height: MAP }, albedo: null, walls: [], lights: [], sight: SEES_ALL, sightRadius: 20, ambient: 0.5 });
    engine.flush();
    rig.world.addChild(engine.layer);
    return engine;
  }

  it('holds the frame and filter textures of the frame\'s own size, not of the next power of two', async (ctx) => {
    const rig = await setup({ pane: [1200, 800] });
    withFilter(rig);
    rig.ownCanvas();
    const figures: Record<string, { heldMb: number; unregisteredMb: number }> = {};
    for (const [width, height] of [[1920, 1080], [2560, 1440], [3840, 2160]] as const) {
      // The map covers the whole frame: the filter's area is the frame
      const frame = { ...frameOf(width, height), scale: 4 };
      TexturePool.clear();
      rig.ownCanvas();
      const before = heldMb(rig.renderer);
      rig.mirrored(frame);
      const held = heldMb(rig.renderer) - before;
      rig.frames.release();
      // The same render without the frame's size registered with the pool
      TexturePool.clear();
      rig.ownCanvas();
      const plainBefore = heldMb(rig.renderer);
      const plain = RenderTexture.create({ width, height });
      rig.camera(frame);
      rig.renderer.render({ container: rig.app.stage, target: plain, clear: true });
      const unregistered = heldMb(rig.renderer) - plainBefore;
      plain.destroy(true);
      figures[`${width}x${height}`] = { heldMb: Math.round(held * 10) / 10, unregisteredMb: Math.round(unregistered * 10) / 10 };
      // The frame's own texture and two of its size for the filter
      const own = (width * height * 4) / 1e6;
      expect(held).toBeLessThanOrEqual(own * 3 + 1);
      expect(unregistered).toBeGreaterThan(held);
    }
    await ctx.annotate(JSON.stringify(figures), 'graphics memory');
    console.info(`players' frame, graphics memory of its textures: ${JSON.stringify(figures)}`);
  });

  it('gives its textures back when released, and holds no more after twenty frames and releases than after one', async () => {
    const rig = await setup();
    withFilter(rig);
    rig.ownCanvas();
    TexturePool.clear();
    rig.ownCanvas();
    const idle = { count: textureCount(rig.renderer), mb: heldMb(rig.renderer) };
    // The map covers the whole frame: the filter takes textures of the frame's size
    const covered = (width: number, height: number, antialias = false): PlayerFrame => ({ ...frameOf(width, height, 1, antialias), scale: 1 });
    rig.mirrored(covered(900, 500));
    expect(heldMb(rig.renderer)).toBeGreaterThan(idle.mb + 3 * 900 * 500 * 4 / 1e6 - 0.1);
    rig.frames.release();
    expect({ count: textureCount(rig.renderer), mb: heldMb(rig.renderer) }).toEqual(idle);
    for (let i = 0; i < 20; i++) {
      // Another size each time, as a window that is opened, resized and closed
      rig.mirrored(covered(900 + i * 7, 500 + i * 3));
      rig.mirrored(covered(640, 360, true));
      rig.frames.release();
    }
    expect({ count: textureCount(rig.renderer), mb: heldMb(rig.renderer) }).toEqual(idle);
  });

  it('leaves in the pool only what the pool rounded to a power of two, which does not add up', async () => {
    const rig = await setup();
    withFilter(rig);
    rig.ownCanvas();
    TexturePool.clear();
    rig.ownCanvas();
    const idle = heldMb(rig.renderer);
    // The map covers 410 px of the frame's 900 and more: the filter's textures are 512 px a side
    const cycles = (): void => {
      for (let i = 0; i < 20; i++) {
        rig.mirrored(frameOf(900 + i * 7, 500 + i * 3));
        rig.frames.release();
      }
    };
    cycles();
    const once = { count: textureCount(rig.renderer), mb: heldMb(rig.renderer) };
    // A handful of textures of that size, however many frames came and went
    expect(once.mb - idle).toBeLessThanOrEqual(4 * 512 * 512 * 4 / 1e6 + 0.01);
    cycles();
    expect({ count: textureCount(rig.renderer), mb: heldMb(rig.renderer) }).toEqual(once);
  });

  it('warns of nothing when a frame is resized, released and made again beside a lit view', async () => {
    const rig = await setup();
    withFilter(rig);
    rig.ownCanvas();
    const warn = vi.spyOn(console, 'warn');
    try {
      rig.mirrored(frameOf(900, 500));
      rig.mirrored(frameOf(640, 360, 1, true));
      rig.frames.release();
      rig.ownCanvas();
      rig.mirrored(frameOf(900, 500));
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('makes a frame of another size anew, and drops the one before', async () => {
    const rig = await setup();
    rig.mirrored(frameOf(900, 500));
    const large = heldMb(rig.renderer);
    rig.mirrored(frameOf(300, 200));
    expect(heldMb(rig.renderer)).toBeLessThan(large - 1);
    expectSame(rig, frameOf(300, 200));
  });

  it('renders nothing while the graphics context is lost, lets go of its texture, and renders a whole frame again once it is back', async () => {
    const rig = await setup();
    const frame = frameOf(500, 333);
    expectSame(rig, frame);
    expect(rig.frames.canRender()).toBe(true);
    const texture = (rig.frames as unknown as { texture: RenderTexture | null }).texture;
    expect(texture?.destroyed).toBe(false);
    let whileLost: boolean | null = null;
    await resetContext(rig.renderer as WebGLRenderer, () => { whileLost = rig.frames.canRender(); });
    expect(whileLost).toBe(false);
    // The restored context starts without the frame's pixels: the texture is gone, not kept blank
    expect(texture?.destroyed).toBe(true);
    expect((rig.frames as unknown as { texture: RenderTexture | null }).texture).toBeNull();
    expect(rig.frames.canRender()).toBe(true);
    expectSame(rig, frame);
  });
});
