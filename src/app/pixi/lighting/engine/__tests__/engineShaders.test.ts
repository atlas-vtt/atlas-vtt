import { describe, expect, it } from 'vitest';
import { ENGINE_SHADERS, type EngineShaderSource } from '../engineShaders';

/**
 * Uniforms PIXI 8.21 sets itself, with its own types, on every shader that declares them: the
 * mesh pipe's local group and the renderer's global group on each `Mesh`, the filter system's
 * group on each filter. A shader that declares one with another type gets PIXI's setter
 * (`uniform4f` on a `vec3`), a GL error on every draw.
 */
const PIXI_UNIFORMS: Record<string, string> = {
  uTransformMatrix: 'mat3',
  uColor: 'vec4',
  uRound: 'float',
  uProjectionMatrix: 'mat3',
  uWorldTransformMatrix: 'mat3',
  uWorldColorAlpha: 'vec4',
  uResolution: 'vec2',
  uInputSize: 'vec4',
  uInputPixel: 'vec4',
  uInputClamp: 'vec4',
  uOutputFrame: 'vec4',
  uGlobalFrame: 'vec4',
  uOutputTexture: 'vec4',
};

const shaders: [string, EngineShaderSource][] = Object.values(ENGINE_SHADERS).map((shader) => [shader.name, shader]);

/** `name → type` of every uniform a GLSL source declares. */
function uniformsOf(source: string): Map<string, string> {
  const declared = new Map<string, string>();
  for (const [, type, name] of source.matchAll(/^\s*uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)/gm)) declared.set(name!, type!);
  return declared;
}

/** Sampling and derivative calls that take the mip level from screen-space gradients. */
const IMPLICIT_GRADIENT = /\b(?:texture(?:Offset|Proj|ProjOffset)?|texture2D|dFdx|dFdy|fwidth)\s*\(/g;

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('engine shader sources', () => {
  it('lists every engine program once', () => {
    const names = shaders.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThanOrEqual(9);
  });

  it.each(shaders)('%s declares the uniforms PIXI sets with PIXI\'s types', (_name, shader) => {
    const clashes: string[] = [];
    for (const [stage, source] of [['vertex', shader.vertex], ['fragment', shader.fragment]] as const) {
      for (const [name, type] of uniformsOf(source)) {
        const expected = PIXI_UNIFORMS[name];
        if (expected && expected !== type) clashes.push(`${stage}: uniform ${type} ${name} (PIXI sets a ${expected})`);
      }
    }
    expect(clashes).toEqual([]);
  });

  // A merge once kept a read of uInputPixel and dropped its declaration: the composite failed to link and every view fell back to the Canvas picture.
  it.each(shaders)('%s declares every uniform of PIXI\'s it reads', (_name, shader) => {
    const undeclared: string[] = [];
    for (const [stage, source] of [['vertex', shader.vertex], ['fragment', shader.fragment]] as const) {
      const declared = uniformsOf(source);
      const code = withoutComments(source);
      for (const name of Object.keys(PIXI_UNIFORMS)) if (new RegExp(`\\b${name}\\b`).test(code) && !declared.has(name)) undeclared.push(`${stage}: ${name}`);
    }
    expect(undeclared).toEqual([]);
  });

  // ANGLE translates GLSL to HLSL for Direct3D, whose compiler rejects or unrolls loops and
  // branches that sample with implicit gradients; every engine read names its level instead.
  it.each(shaders)('%s samples every texture at an explicit level', (_name, shader) => {
    const implicit = [shader.vertex, shader.fragment].flatMap((source) => withoutComments(source).match(IMPLICIT_GRADIENT) ?? []);
    expect(implicit).toEqual([]);
  });

  it('finds implicit-gradient reads, and only those (the check can fail)', () => {
    const source = 'a = texture(uMap, uv); // texture(in a comment)\nb = textureLod(uMap, uv, 0.0) + texelFetch(uMap, p, 0) + vec4(textureSize(uMap, 0), dFdx(uv));';
    expect(withoutComments(source).match(IMPLICIT_GRADIENT)).toEqual(['texture(', 'dFdx(']);
  });

  it('finds the uniforms of a source (the check can fail)', () => {
    expect(Object.fromEntries(uniformsOf('uniform vec3 uColor;\n  uniform highp sampler2D uTile;\nuniform mat3 uProjectionMatrix;'))).toEqual({
      uColor: 'vec3',
      uTile: 'sampler2D',
      uProjectionMatrix: 'mat3',
    });
  });
});
