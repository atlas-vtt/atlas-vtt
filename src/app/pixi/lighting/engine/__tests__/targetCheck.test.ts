import { describe, expect, it } from 'vitest';
import { ENGINE_TARGET_FORMATS, unrenderableEngineTargets } from '../targetCheck';

const FORMATS = { RGBA16F: 1, R16F: 2, RG16F: 3, R8: 4, RG8: 5, RGBA8: 6 };
const COMPLETE = 100;

/** A WebGL 2 context as far as the probe goes: it renders into every format but `refused`. */
function fakeGl(refused: number[] = []): { gl: WebGL2RenderingContext; bound: { texture: unknown; framebuffer: unknown }; extensions: string[]; live: Set<unknown> } {
  const bound: { texture: unknown; framebuffer: unknown } = { texture: 'pixi-texture', framebuffer: 'pixi-framebuffer' };
  const extensions: string[] = [];
  const live = new Set<unknown>();
  const stored = new Map<unknown, number>();
  let attached: unknown = null;
  const make = (kind: string): object => {
    const made = { kind };
    live.add(made);
    return made;
  };
  const gl = {
    ...FORMATS,
    TEXTURE_2D: 10, TEXTURE_BINDING_2D: 11, DRAW_FRAMEBUFFER: 12, DRAW_FRAMEBUFFER_BINDING: 13, COLOR_ATTACHMENT0: 14, FRAMEBUFFER_COMPLETE: COMPLETE,
    getExtension: (name: string): null => {
      extensions.push(name);
      return null;
    },
    getParameter: (name: number): unknown => (name === 11 ? bound.texture : bound.framebuffer),
    createTexture: (): object => make('texture'),
    createFramebuffer: (): object => make('framebuffer'),
    deleteTexture: (texture: unknown): boolean => live.delete(texture),
    deleteFramebuffer: (framebuffer: unknown): boolean => live.delete(framebuffer),
    bindTexture: (_target: number, texture: unknown): void => { bound.texture = texture; },
    bindFramebuffer: (_target: number, framebuffer: unknown): void => { bound.framebuffer = framebuffer; },
    texStorage2D: (_target: number, _levels: number, format: number): void => { stored.set(bound.texture, format); },
    framebufferTexture2D: (_target: number, _attachment: number, _texTarget: number, texture: unknown): void => { attached = texture; },
    checkFramebufferStatus: (): number => (refused.includes(stored.get(attached) ?? -1) ? 0 : COMPLETE),
  };
  // The probe uses nothing else of a context
  return { gl: gl as unknown as WebGL2RenderingContext, bound, extensions, live };
}

describe('unrenderableEngineTargets', () => {
  it('finds nothing wrong on a device that renders into every engine format', () => {
    expect(unrenderableEngineTargets(fakeGl().gl)).toEqual([]);
  });

  it('names the formats whose framebuffer is not complete', () => {
    const { gl } = fakeGl([FORMATS.RGBA16F, FORMATS.R16F]);
    expect(unrenderableEngineTargets(gl)).toEqual(['rgba16float', 'r16float']);
  });

  it('asks for every format the engine renders into', () => {
    const { gl } = fakeGl(Object.values(FORMATS));
    expect(unrenderableEngineTargets(gl)).toEqual([...ENGINE_TARGET_FORMATS]);
  });

  it('asks for the float rendering extensions first, and leaves bindings and objects as it found them', () => {
    const { gl, bound, extensions, live } = fakeGl([FORMATS.RG16F]);
    unrenderableEngineTargets(gl);
    expect(extensions).toEqual(['EXT_color_buffer_float', 'EXT_color_buffer_half_float']);
    expect(bound).toEqual({ texture: 'pixi-texture', framebuffer: 'pixi-framebuffer' });
    expect(live.size).toBe(0);
  });

  it('does not ask a WebGL 1 context', () => {
    const webgl1 = { getExtension: (): never => { throw new Error('asked'); } };
    expect(unrenderableEngineTargets(webgl1 as unknown as WebGLRenderingContext)).toEqual([]);
  });
});
