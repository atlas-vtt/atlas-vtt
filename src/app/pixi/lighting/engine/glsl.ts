import { FADE_POWER } from '../../../lighting/lightingConstants';
/**
 * PIXI compiles a shader as GLSL ES 1.00 unless its source starts with this line; `textureLod()`,
 * `flat` and the other WebGL2 features the engine uses need ES 3.00, so every engine shader starts with it.
 * ES 3.00 defaults `sampler2D` to lowp and PIXI only adds a float precision, so the line also lifts
 * samplers to highp: every lighting texture is read at full precision.
 */
export const GLSL_VERSION = '#version 300 es\nprecision highp sampler2D;\n';

/** Steps a sphere trace may take; running out counts as blocked. */
export const MAX_STEPS = 256;

/**
 * A capsule field sampled conservatively: the stored distance minus the interpolation margin
 * (`Params.x`), shrunk by how far `w` lies outside the field; `Clearance` also subtracts the
 * wall radius (`Params.y`), so it is the distance to the nearest capsule's surface.
 */
export function fieldGlsl(name: string): string {
  return `
uniform sampler2D ${name};
uniform vec4 ${name}Rect;
uniform vec2 ${name}Params;
float ${name}Distance(vec2 w) {
  vec2 lo = ${name}Rect.xy;
  vec2 inside = clamp(w, lo, lo + ${name}Rect.zw);
  return textureLod(${name}, (inside - lo) / ${name}Rect.zw, 0.0).r - length(w - inside) - ${name}Params.x;
}
float ${name}Clearance(vec2 w) { return ${name}Distance(w) - ${name}Params.y; }`;
}

/**
 * Whether the straight path from p to t stays outside every wall. Steps never exceed the
 * conservative clearance, so no wall can be jumped; out of steps counts as blocked.
 * Requires `float clearance(vec2)`, or the function named, for a program that traces two fields.
 */
export function traceGlsl(name = 'reaches', clearance = 'clearance'): string {
  return `
bool ${name}(vec2 p, vec2 t) {
  vec2 d = t - p;
  float len = length(d);
  if (len < 1e-3) return true;
  vec2 dir = d / len;
  float s = 0.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    float c = ${clearance}(p + dir * s);
    if (c < 0.02) return false;
    if (len - s <= c) return true;
    s += c;
  }
  return false;
}`;
}

export const TRACE_GLSL = traceGlsl();

/** Full-target pass: `aPosition` 0..1 covers the target, `vUv` is the texel centre. */
export const FULLSCREEN_VERTEX = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition;
  gl_Position = vec4(aPosition * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SRGB_GLSL = `
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }`;

/**
 * How the lighting turns light into colour, shared by the composite and the roofs, so a roof and the
 * floor beneath it are lit alike: Khronos PBR Neutral (colours stay as painted up to ~0.8, highlights
 * roll off to white), and the cool grey low light takes on by `night` (the share it is dim, Purkinje).
 */
export const TONEMAP_GLSL = `
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 neutral(vec3 color) {
  const float start = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < start) return color;
  const float d = 1.0 - start;
  float newPeak = 1.0 - d * d / (peak + d - start);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 nightShift(vec3 lit, float night) {
  return mix(lit, vec3(dot(lit, LUMA)) * vec3(0.86, 0.96, 1.18), night);
}`;

/**
 * The fade of a light within its dim range, a beam towards its sides and a sense towards its
 * range's edge (`LIGHT_FADE_MIN`): the share left at u, 1 where the fade begins and 0 where it
 * ends. What the eye sees falls as (u(2 − u))^1.5: level where it begins, so no ring marks it,
 * still clearly lit halfway (0.65), dark near its end (0.08 at nine tenths), and level again at
 * nothing, so no step marks the end. The light falls as that to the power `FADE_POWER`, about the
 * display's own.
 */
export const FADE_GLSL = `
float fadeOf(float u) {
  u = clamp(u, 0.0, 1.0);
  return pow(u * (2.0 - u), ${(1.5 * FADE_POWER).toFixed(2)});
}`;

/** Share of a unit disc left of x (-1..1). */
export const DISC_SHARE_GLSL = `
float discShare(float x) {
  x = clamp(x, -1.0, 1.0);
  return 0.5 + (x * sqrt(1.0 - x * x) + asin(x)) / 3.14159265;
}`;
