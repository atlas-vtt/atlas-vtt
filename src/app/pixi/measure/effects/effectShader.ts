import { GlProgram, Shader, UniformGroup, type Texture } from 'pixi.js';
import type { MeasureEffect } from '../../../measure/measureEffects';
import { NOISE_GLSL } from '../../liquids/glsl/noiseGlsl';
import { GLSL_VERSION } from '../../lighting/engine/glsl';
import { HIGHP } from '../../lighting/engine/gpu';
import { EFFECT_GLSL } from './glsl/effectGlsl';
import { FIRE_GLSL } from './glsl/fireGlsl';
import { FROST_GLSL } from './glsl/frostGlsl';
import { LIGHTNING_GLSL } from './glsl/lightningGlsl';
import { MIST_GLSL } from './glsl/mistGlsl';
import { RADIANCE_GLSL } from './glsl/radianceGlsl';
import { SHADOW_GLSL } from './glsl/shadowGlsl';

/** The number the shader knows each effect by (`uEffect`). */
export const EFFECT_CODE: Readonly<Record<MeasureEffect, number>> = { fire: 0, frost: 1, lightning: 2, mist: 3, radiance: 4, shadow: 5 };

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vPlace;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPlace = aPosition;
}`;

/**
 * One area's effect over the map, in the area's one colour (`uTint`; PIXI keeps `uColor` for
 * itself). Premultiplied colour that may exceed its alpha, drawn with normal blending: alpha lays
 * the look's pigment over the map, colour beyond it glows, so a look reads on a dark map and on a
 * bright one. Every look fades to nothing at the outline over the field's first part of a cell, and
 * nothing is drawn past the outline: the mesh is the outline. The field is read with `textureLod`
 * only (no implicit gradients, as the lighting engine's rules ask).
 */
const fragment = `${GLSL_VERSION}
in vec2 vPlace;
out vec4 finalColor;

uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform vec4 uFieldCode;
uniform float uDepth;
uniform float uCell;
uniform float uEffect;
uniform vec3 uTint;
uniform vec2 uShift;
uniform vec4 uFrame;
uniform float uSpread;
uniform float uReach;
uniform vec4 uDriftA;
uniform vec4 uDriftB;
uniform float uTime;
uniform vec2 uSeed;
uniform float uDetail;
uniform float uStill;
${NOISE_GLSL}
${EFFECT_GLSL}
${FIRE_GLSL}
${FROST_GLSL}
${LIGHTNING_GLSL}
${MIST_GLSL}
${RADIANCE_GLSL}
${SHADOW_GLSL}
/** The outline's distance in cells at this pixel, positive inside. */
float edgeDistance() {
  vec2 uv = (vPlace - uFieldRect.xy) / uFieldRect.zw;
  vec4 code = textureLod(uField, uv, 0.0);
  float near = code.r * (uFieldCode.x + uFieldCode.y) - uFieldCode.x;
  float far = code.g * uFieldCode.z;
  return mix(near, max(near, far), smoothstep(0.9, 0.99, code.r));
}

void main() {
  // Cells from the area's origin: its patterns hold on to it, so they go where it goes.
  vec2 p = (vPlace + uShift) / uCell;
  float px = max(length(fwidth(p)) * 0.7071, 1e-5);
  float d = edgeDistance();
  float feather = smoothstep(0.0, max(0.06, px * 1.5), d);
  if (feather <= 0.0) discard;
  vec4 colour = uEffect < 0.5 ? fire(p, d, px)
    : uEffect < 1.5 ? frost(p, d, px)
    : uEffect < 2.5 ? lightning(p, d, px)
    : uEffect < 3.5 ? mist(p, d, px)
    : uEffect < 4.5 ? radiance(p, d, px)
    : shadow(p, d, px);
  finalColor = colour * feather;
}`;

/** How much of its look an effect draws, by the lighting quality (`liquidDetail`): 2 at high, 1 at balanced, 0 at saver. */
export type EffectDetail = 0 | 1 | 2;

/** What every piece of one area shares: its look, colour, frame and clock. */
export interface EffectLookUniforms {
  uCell: number;
  uEffect: number;
  uTint: Float32Array;
  /** From a piece's own place to the area's origin, world pixels: what its patterns hold on to. */
  uShift: Float32Array;
  /** The area's middle (xy, cells from its origin) and the way it is long (zw). */
  uFrame: Float32Array;
  /** How far arcs may lean from the area's length, radians: half a turn on a round area. */
  uSpread: number;
  /** How far the area reaches from its origin, cells. */
  uReach: number;
  uDriftA: Float32Array;
  uDriftB: Float32Array;
  uTime: number;
  uSeed: Float32Array;
  /** `EffectDetail`. */
  uDetail: number;
  /** 1 while the effect is held still: lightning then shows arcs that stand. */
  uStill: number;
}

/** What is a piece's own: its distance field and how deep it is. */
export interface EffectPieceUniforms {
  uFieldRect: Float32Array;
  uFieldCode: Float32Array;
  /** The piece's deepest point, cells from its outline. */
  uDepth: number;
}

export interface EffectLook {
  group: UniformGroup;
  uniforms: EffectLookUniforms;
}

export function createEffectLook(): EffectLook {
  const group = new UniformGroup({
    uCell: { value: 1, type: 'f32' },
    uEffect: { value: 0, type: 'f32' },
    uTint: { value: new Float32Array(3), type: 'vec3<f32>' },
    uShift: { value: new Float32Array(2), type: 'vec2<f32>' },
    uFrame: { value: new Float32Array([0, 0, 1, 0]), type: 'vec4<f32>' },
    uSpread: { value: Math.PI, type: 'f32' },
    uReach: { value: 1, type: 'f32' },
    uDriftA: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDriftB: { value: new Float32Array(4), type: 'vec4<f32>' },
    uTime: { value: 0, type: 'f32' },
    uSeed: { value: new Float32Array(2), type: 'vec2<f32>' },
    uDetail: { value: 2, type: 'f32' },
    uStill: { value: 0, type: 'f32' },
  });
  return { group, uniforms: group.uniforms };
}

export interface EffectPieceShader {
  shader: Shader;
  uniforms: EffectPieceUniforms;
}

/**
 * The shader of one piece of an area: the area's `look` and the piece's own distance field. WebGL
 * only, as the liquids are; the program is shared through PIXI's cache, so destroying a piece's
 * shader leaves it for the next.
 */
export function createEffectShader(look: UniformGroup, field: Texture): EffectPieceShader {
  const piece = new UniformGroup({
    uFieldRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uFieldCode: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDepth: { value: 1, type: 'f32' },
  });
  const glProgram = GlProgram.from({ vertex, fragment, name: 'atlas-measure-effect', preferredFragmentPrecision: HIGHP });
  const shader = new Shader({ glProgram, resources: { look, piece, uField: field.source } });
  return { shader, uniforms: piece.uniforms };
}
