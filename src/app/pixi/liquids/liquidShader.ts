import { GlProgram, Shader, UniformGroup, type Texture } from 'pixi.js';
import { HIGHP } from '../lighting/engine/gpu';
import { GLSL_VERSION } from '../lighting/engine/glsl';
import { ACID_GLSL } from './glsl/acidGlsl';
import { CRAYON_GLSL } from './glsl/crayonGlsl';
import { LAVA_GLSL } from './glsl/lavaGlsl';
import { NOISE_GLSL } from './glsl/noiseGlsl';
import { WATER_GLSL } from './glsl/waterGlsl';

const vertex = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}`;

/**
 * Pigment over the painted map, in the surface's own colours, as premultiplied colour never above
 * alpha: drawn with normal blending it paints over the map and never lights it, so every look keeps
 * its art beneath, painted, engraved (`uEngraved`) or in crayon (`uCrayon`). The shore fades to nothing over the field's
 * first cells, so no hard edge is drawn, and nothing is drawn past the outline: the mesh is the
 * outline.
 */
const fragment = `${GLSL_VERSION}
in vec2 vWorld;
out vec4 finalColor;

uniform sampler2D uField;
uniform sampler2D uCourse;
uniform float uCoursed;
uniform vec4 uFieldRect;
uniform vec4 uFieldCode;
uniform float uCell;
uniform float uKind;
uniform float uFlowing;
uniform vec4 uFrame;
uniform vec4 uDriftA;
uniform vec4 uDriftB;
uniform float uTime;
uniform vec2 uSeed;
uniform vec3 uSurface;
uniform vec3 uDeep;
uniform vec3 uGlint;
uniform float uEngraved;
uniform float uCrayon;
uniform float uDetail;
uniform float uLavaGlow;
${NOISE_GLSL}
${WATER_GLSL}
${LAVA_GLSL}
${ACID_GLSL}
${CRAYON_GLSL}
/** The shore's distance in cells at this pixel, positive inside. */
float shoreDistance() {
  vec2 uv = (vWorld - uFieldRect.xy) / uFieldRect.zw;
  vec4 code = textureLod(uField, uv, 0.0);
  float near = code.r * (uFieldCode.x + uFieldCode.y) - uFieldCode.x;
  float far = code.g * uFieldCode.z;
  return mix(near, max(near, far), smoothstep(0.9, 0.99, code.r));
}

/** Across and along the surface's course at this pixel, in cells: its frame texels, blended by hand (float textures need not filter). */
vec2 courseAt() {
  ivec2 size = textureSize(uCourse, 0);
  vec2 at = (vWorld - uFieldRect.xy) / uFieldRect.zw * vec2(size) - 0.5;
  vec2 base = floor(at);
  vec2 f = at - base;
  ivec2 i = ivec2(base);
  ivec2 last = size - 1;
  vec2 a = texelFetch(uCourse, clamp(i, ivec2(0), last), 0).rg;
  vec2 b = texelFetch(uCourse, clamp(i + ivec2(1, 0), ivec2(0), last), 0).rg;
  vec2 c = texelFetch(uCourse, clamp(i + ivec2(0, 1), ivec2(0), last), 0).rg;
  vec2 d = texelFetch(uCourse, clamp(i + ivec2(1, 1), ivec2(0), last), 0).rg;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 cells = vWorld / uCell;
  // The surface's frame: across and along its course or its flow, or the map's own axes.
  vec2 q = uCoursed > 0.5 ? courseAt() : vec2(dot(cells, uFrame.xy), dot(cells, uFrame.zw));
  float px = max(length(fwidth(cells)) * 0.7071, 1e-5);
  float near = smoothstep(45.0, 120.0, 1.0 / px);
  float d = shoreDistance();
  float feather = smoothstep(0.0, max(0.07, px * 1.5), d);
  if (feather <= 0.0) discard;
  vec4 colour = uCrayon > 0.5
    ? (uKind < 0.5 ? crayonWater(q, d, px) : uKind < 1.5 ? crayonLava(q, d, px) : crayonAcid(q, d, px))
    : (uKind < 0.5 ? water(q, d, px, near) : uKind < 1.5 ? lava(q, d, px, near) : acid(q, d, px, near));
  finalColor = colour * feather;
}`;

/**
 * How much of its material a surface draws, by the lighting quality (`liquidDetail`): 2 at high,
 * 1 at balanced, 0 at saver. Each liquid spends it its own way: fewer noise octaves, no finest
 * layers, and lava's smoulder held steady at saver.
 */
export type LiquidDetail = 0 | 1 | 2;

/** The uniforms of one surface: its field, colours and frame; its clock and drifts follow the layer's. */
export interface LiquidUniforms {
  uFieldRect: Float32Array;
  uFieldCode: Float32Array;
  uCell: number;
  uKind: number;
  uFlowing: number;
  uFrame: Float32Array;
  /** 1 where the surface flows along a course, its frame read from `uCourse`. */
  uCoursed: number;
  uDriftA: Float32Array;
  uDriftB: Float32Array;
  uTime: number;
  uSeed: Float32Array;
  uSurface: Float32Array;
  uDeep: Float32Array;
  uGlint: Float32Array;
  /** 1 where the map is engraved (`LiquidSurface.art`): ink and hatching instead of paint. */
  uEngraved: number;
  /** 1 where the map is coloured in crayon (`LiquidSurface.art`): hand-drawn strokes that boil. */
  uCrayon: number;
  /** `LiquidDetail`. */
  uDetail: number;
  /** Lava's smoulder, in step with the light it glows with; 1 holds it steady. */
  uLavaGlow: number;
}

export interface LiquidShader {
  shader: Shader;
  uniforms: LiquidUniforms;
}

/**
 * The shader of one liquid surface. Atlas renders surfaces with WebGL only; without it the still
 * map shows (`LiquidLayer` builds nothing). The program is shared through PIXI's cache. `course`
 * is the surface's course frame (`courseFrame`); a surface without one binds its field there,
 * which it never reads.
 */
export function createLiquidShader(field: Texture, course: Texture = field): LiquidShader {
  const group = new UniformGroup({
    uFieldRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uFieldCode: { value: new Float32Array(4), type: 'vec4<f32>' },
    uCell: { value: 1, type: 'f32' },
    uKind: { value: 0, type: 'f32' },
    uFlowing: { value: 0, type: 'f32' },
    uFrame: { value: new Float32Array([1, 0, 0, 1]), type: 'vec4<f32>' },
    uCoursed: { value: 0, type: 'f32' },
    uDriftA: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDriftB: { value: new Float32Array(4), type: 'vec4<f32>' },
    uTime: { value: 0, type: 'f32' },
    uSeed: { value: new Float32Array(2), type: 'vec2<f32>' },
    uSurface: { value: new Float32Array(3), type: 'vec3<f32>' },
    uDeep: { value: new Float32Array(3), type: 'vec3<f32>' },
    uGlint: { value: new Float32Array(3), type: 'vec3<f32>' },
    uEngraved: { value: 0, type: 'f32' },
    uCrayon: { value: 0, type: 'f32' },
    uDetail: { value: 2, type: 'f32' },
    uLavaGlow: { value: 1, type: 'f32' },
  });
  const glProgram = GlProgram.from({ vertex, fragment, name: 'atlas-liquid-surface', preferredFragmentPrecision: HIGHP });
  const shader = new Shader({ glProgram, resources: { liquid: group, uField: field.source, uCourse: course.source } });
  return { shader, uniforms: group.uniforms };
}
