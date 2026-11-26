import { Container, Matrix, RenderTexture, Sprite, Texture, WebGLRenderer } from 'pixi.js';
import type { LightingEngine } from '../LightingEngine';

/**
 * A WebGL2 renderer on an offscreen canvas, as the plugin uses; `resolution` 2 as on a Retina
 * display. The plugin's canvas is antialiased; most tests render to textures, where it is not read.
 */
export async function createTestRenderer(size = 512, resolution = 1, antialias = false): Promise<WebGLRenderer> {
  const renderer = new WebGLRenderer();
  await renderer.init({ width: size, height: size, antialias, backgroundAlpha: 1, resolution });
  return renderer;
}

/** What a 2D copy of `canvas` shows at device pixel (x, y), read in the task that rendered it. */
export function copiedPixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  const context = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d')!;
  context.drawImage(canvas, 0, 0);
  return Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3));
}

/** Texels of a float target in GL row order (row 0 is where clip y = −1 wrote). */
export function readFloats(renderer: WebGLRenderer, target: RenderTexture): Float32Array {
  const { gl } = renderer;
  renderer.renderTarget.bind({ target, clear: false });
  const { pixelWidth, pixelHeight } = target.source;
  const out = new Float32Array(pixelWidth * pixelHeight * 4);
  gl.readPixels(0, 0, pixelWidth, pixelHeight, gl.RGBA, gl.FLOAT, out);
  return out;
}

/** Pixels of an 8-bit target, top row first, as PIXI presents them. */
export function readRgba(renderer: WebGLRenderer, target: RenderTexture): Uint8ClampedArray {
  return renderer.extract.pixels({ target }).pixels;
}

/**
 * Texels of a normalized 8-bit target as 0..1 floats in GL row order, like `readFloats`;
 * WebGL2 allows FLOAT readback only from float targets, so this reads bytes.
 */
export function readUnorm(renderer: WebGLRenderer, target: RenderTexture): Float32Array {
  const { gl } = renderer;
  renderer.renderTarget.bind({ target, clear: false });
  const { pixelWidth, pixelHeight } = target.source;
  const bytes = new Uint8Array(pixelWidth * pixelHeight * 4);
  gl.readPixels(0, 0, pixelWidth, pixelHeight, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  return Float32Array.from(bytes, (v) => v / 255);
}

/**
 * Sets the share of the map the GM's picture is never darker than (`GM_FLOOR.shown`), for the
 * engine's present composite; 0 is the picture without that floor. Call after the scene is built.
 */
export function setGmFloor(engine: LightingEngine, shown: number): void {
  const group = (engine as unknown as { composite: { filter: { resources: { compositeUniforms: { uniforms: { uGmFloor: number }; update(): void } } } } }).composite.filter.resources.compositeUniforms;
  group.uniforms.uGmFloor = shown;
  group.update();
}

/** Reads one screen pixel of a render as 0..255 sRGB channels. */
export type PixelReader = (sx: number, sy: number) => readonly [number, number, number];

/**
 * Renders a map of `map` px (1024; white, or `tint`) with the engine's lighting layer on top
 * through a camera at `scale`, offset (x, y), into a square target of `size` px.
 */
export function renderThroughEngine(
  engine: LightingEngine,
  renderer: WebGLRenderer,
  camera: { size: number; scale: number; x: number; y: number; tint?: number; map?: number },
): PixelReader {
  const { size, scale, x, y, tint = 0xffffff, map = 1024 } = camera;
  const stage = new Container();
  const floor = new Sprite(Texture.WHITE);
  floor.setSize(map, map);
  floor.tint = tint;
  const world = new Container();
  world.addChild(floor, engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
  const target = RenderTexture.create({ width: size, height: size });
  renderer.render({ container: stage, target, clear: true });
  const pixels = readRgba(renderer, target);
  world.removeChild(engine.layer);
  stage.destroy({ children: true });
  target.destroy(true);
  return (sx, sy) => {
    const i = (sy * size + sx) * 4;
    return [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!];
  };
}
