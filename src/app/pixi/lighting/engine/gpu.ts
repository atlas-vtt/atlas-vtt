import { Buffer, BufferUsage, Geometry, GlProgram, RenderTexture, Shader, type BLEND_MODES, type Container, type Renderer, type TextureSource, type TEXTURE_FORMATS, type UniformGroup, type WebGLRenderer } from 'pixi.js';
import type { EngineShaderSource } from './engineShaders';

export const HIGHP = 'highp';

/** A render texture the engine samples without mipmaps. Our shaders write clip space directly. */
export function createTarget(width: number, height: number, format: TEXTURE_FORMATS, scaleMode: 'linear' | 'nearest' = 'linear'): RenderTexture {
  return RenderTexture.create({
    width: Math.max(1, Math.ceil(width)),
    height: Math.max(1, Math.ceil(height)),
    format,
    scaleMode,
    antialias: false,
    autoGenerateMipmaps: false,
    resolution: 1,
  });
}

export interface Quad {
  vertices: Buffer;
  indices: Buffer;
}

/** A unit square (0..1) in `aPosition`; shaders place it themselves. */
export function createQuad(): Quad {
  return {
    vertices: new Buffer({ data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), usage: BufferUsage.VERTEX }),
    indices: new Buffer({ data: new Uint32Array([0, 1, 2, 1, 3, 2]), usage: BufferUsage.INDEX }),
  };
}

export function destroyQuad(quad: Quad): void {
  quad.vertices.destroy();
  quad.indices.destroy();
}

export function quadGeometry(quad: Quad): Geometry {
  return new Geometry({ attributes: { aPosition: { buffer: quad.vertices, format: 'float32x2' } }, indexBuffer: quad.indices });
}

/** A 1 px target bound in place of textures another object owns, so a shader never keeps one. */
export function createPlaceholder(): RenderTexture {
  return createTarget(1, 1, 'r8unorm', 'nearest');
}

/** The program PIXI compiles for an engine shader: every lighting texture is read at full precision. */
export function engineProgram({ vertex, fragment, name }: EngineShaderSource): GlProgram {
  return GlProgram.from({ vertex, fragment, name, preferredFragmentPrecision: HIGHP });
}

export function createShader(source: EngineShaderSource, resources: Record<string, UniformGroup | TextureSource>): Shader {
  return new Shader({ glProgram: engineProgram(source), resources });
}

/** The engine's WebGL context, or null on a renderer without one. */
export function glOf(renderer: Renderer): WebGLRenderer['gl'] | null {
  return renderer.name === 'webgl' ? (renderer as WebGLRenderer).gl : null;
}

/** While its context is lost a renderer draws nothing, and PIXI throws when asked for a new program. */
export function contextLost(renderer: Renderer): boolean {
  return glOf(renderer)?.isContextLost() ?? false;
}

/**
 * Returns once the graphics process has executed every command sent so far: a round trip,
 * for the one moment that must know a frame was drawn, not merely queued.
 */
export function awaitGpu(renderer: Renderer): void {
  glOf(renderer)?.finish();
}

/** Renders `container` into `target` outside the stage's render, like `ExploredTexture` does. */
export function renderInto(renderer: Renderer, container: Container, target: RenderTexture, clearColor?: [number, number, number, number]): void {
  renderer.render(clearColor ? { container, target, clear: true, clearColor } : { container, target, clear: false });
}

/** A blend PIXI has no name for: colour adds up, alpha keeps the larger (`LightMap`). */
const ADD_KEEP_MAX = 'atlas-add-keep-max';

/**
 * The blend the light map draws its lights with: their colours add up and its alpha keeps the
 * brightest light's, so the composite can tell one light from several (`LIGHT_CEILING`). Added to
 * the WebGL renderer's own table of blends, which PIXI builds anew with every context; where it
 * cannot be (no WebGL 2), lights add up in alpha too, as they did before.
 */
export function addKeepMaxBlend(renderer: Renderer): BLEND_MODES {
  const state: unknown = Reflect.get(renderer, 'state');
  const table: unknown = state && typeof state === 'object' ? Reflect.get(state, 'blendModesMap') : null;
  const gl: unknown = Reflect.get(renderer, 'gl');
  if (!table || typeof table !== 'object' || !gl || typeof gl !== 'object' || !('MAX' in gl)) return 'add';
  const { ONE, FUNC_ADD, MAX } = gl as WebGL2RenderingContext;
  if (!Reflect.has(table, ADD_KEEP_MAX)) Reflect.set(table, ADD_KEEP_MAX, [ONE, ONE, ONE, ONE, FUNC_ADD, MAX]);
  const blend: string = ADD_KEEP_MAX;
  return blend as BLEND_MODES;
}
