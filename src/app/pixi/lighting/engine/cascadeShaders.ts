import { GLSL_VERSION, SRGB_GLSL, fieldGlsl } from './glsl';

/**
 * Every bounce pass draws over `uRegion` of its target (uv: left, top, right, bottom), the whole
 * target or the part a change of the light map can reach (`RadianceCascades.begin`), in bands.
 */
export const cascadeVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRegion;
out vec2 vUv;
void main() {
  vUv = mix(uRegion.xy, uRegion.zw, aPosition);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Lit floor: the light map times the map's colour (linear), over the emission grid. Where the
 * map is transparent (maps without an image, transparent PNG areas) or missing, the floor
 * bounces as mid grey; PIXI textures are premultiplied, so colour is unpremultiplied first.
 * Smaller map images have mipmaps: `uAlbedoLod` is the level whose texel spans an emission texel.
 */
export const emissionFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform sampler2D uLightMap;
uniform sampler2D uAlbedo;
uniform vec2 uEmitWorld;
uniform vec2 uLightWorld;
uniform vec2 uMapSize;
uniform float uHasAlbedo;
uniform float uAlbedoLod;
out vec4 finalColor;
${SRGB_GLSL}
void main() {
  vec2 world = vUv * uEmitWorld;
  vec3 albedo = vec3(0.5);
  if (uHasAlbedo > 0.5) {
    vec4 map = textureLod(uAlbedo, clamp(world / uMapSize, 0.0, 1.0), uAlbedoLod);
    albedo = mix(vec3(0.5), toLinear(min(map.rgb / max(map.a, 1e-4), 1.0)), map.a);
  }
  finalColor = vec4(textureLod(uLightMap, world / uLightWorld, 0.0).rgb * albedo, 1.0);
}`;

/**
 * One cascade (Sannikov): each texel is one direction of one probe. Every light path is a
 * chain of sphere-traced segments: cascade i's ray for child direction d′ ends exactly where
 * cascade i+1's ray d′ starts at the neighbouring probe (bilinear fix, per child), so bounce
 * can no more cross a wall than direct light.
 */
export const cascadeFragment = `${GLSL_VERSION}
uniform sampler2D uEmit;
uniform vec2 uEmitWorld;
uniform sampler2D uUpper;
uniform float uHasUpper;
uniform float uSpacing;
uniform float uS;
uniform float uStart;
uniform float uLen;
uniform vec2 uUpCount;
uniform float uUpSpacing;
uniform float uUpS;
uniform float uUpStart;
uniform float uSafe;
uniform float uSigma;
uniform float uFloorGain;
uniform float uWallGain;
out vec4 finalColor;
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }

// Emission is read only where the clearance (uSafe) keeps every bilinear texel on this side of a wall.
vec3 emitAt(vec2 w) { return textureLod(uEmit, w / uEmitWorld, 0.0).rgb; }

// Light reaching a from b: floor glow on the way, a lit wall where the path stops.
// rgb = radiance, a = transmittance (0 once the path hits a wall).
vec4 march(vec2 a, vec2 b) {
  vec2 d = b - a;
  float L = length(d);
  if (L < 1e-3) return vec4(0.0, 0.0, 0.0, 1.0);
  vec2 dir = d / L;
  float t = 0.0;
  float tEnd = L;
  bool hit = false;
  vec2 lastSafe = a;
  bool hasSafe = false;
  for (int i = 0; i < 64; i++) {
    vec2 x = a + dir * t;
    float c = clearance(x);
    if (c >= uSafe) { lastSafe = x; hasSafe = true; }
    if (c < 0.05) { hit = true; tEnd = t; break; }
    if (L - t <= c) break;
    t += c;
    if (i == 63) { hit = true; tEnd = t; }
  }
  vec3 rad = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    float tj = (float(j) + 0.5) * 0.25 * tEnd;
    vec2 x = a + dir * tj;
    if (clearance(x) < uSafe) continue;
    rad += emitAt(x) * exp(-uSigma * tj) * tEnd * 0.25;
  }
  rad *= uFloorGain;
  if (!hit) return vec4(rad, exp(-uSigma * L));
  if (hasSafe) rad += uWallGain * emitAt(lastSafe) * exp(-uSigma * tEnd);
  return vec4(rad, 0.0);
}

vec2 dirOf(int k, float n) {
  float angle = (float(k) + 0.5) / n * 6.28318531;
  return vec2(cos(angle), sin(angle));
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  int s = int(uS);
  ivec2 probe = px / s;
  ivec2 local = px - probe * s;
  int k = local.y * s + local.x;
  vec2 dir = dirOf(k, float(s * s));
  vec2 p = (vec2(probe) + 0.5) * uSpacing;
  vec2 a = p + dir * uStart;
  if (uHasUpper < 0.5) { finalColor = vec4(march(a, p + dir * (uStart + uLen)).rgb, 1.0); return; }
  int us = int(uUpS);
  float un = float(us * us);
  vec2 g = p / uUpSpacing - 0.5;
  vec2 base = floor(g);
  vec2 f = g - base;
  vec3 sum = vec3(0.0);
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1);
    ivec2 q = clamp(ivec2(base) + off, ivec2(0), ivec2(uUpCount) - 1);
    float w = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
    vec2 qw = (vec2(q) + 0.5) * uUpSpacing;
    vec3 acc = vec3(0.0);
    for (int c = 0; c < 4; c++) {
      int kk = k * 4 + c;
      vec4 seg = march(a, qw + dirOf(kk, un) * uUpStart);
      acc += seg.rgb + seg.a * texelFetch(uUpper, q * us + ivec2(kk % us, kk / us), 0).rgb;
    }
    sum += w * acc * 0.25;
  }
  finalColor = vec4(sum, 1.0);
}`;

/** Cascade 0's four directions averaged: the light arriving at each probe. */
export const resolveFragment = `${GLSL_VERSION}
uniform sampler2D uC0;
out vec4 finalColor;
void main() {
  ivec2 q = ivec2(gl_FragCoord.xy) * 2;
  vec3 s = texelFetch(uC0, q, 0).rgb + texelFetch(uC0, q + ivec2(1, 0), 0).rgb
         + texelFetch(uC0, q + ivec2(0, 1), 0).rgb + texelFetch(uC0, q + ivec2(1, 1), 0).rgb;
  finalColor = vec4(s * 0.25, 1.0);
}`;

/** The composite's read of the bounce: only probes this pixel has a clear straight path to. */
export const BOUNCE_GATHER_GLSL = `
uniform sampler2D uFluence;
uniform float uFluSpacing;
vec3 bounceAt(vec2 w) {
  ivec2 count = textureSize(uFluence, 0);
  vec2 g = w / uFluSpacing - 0.5;
  vec2 base = floor(g);
  vec2 f = g - base;
  bool open = clearance(w) > uFluSpacing * 1.415;
  vec3 s = vec3(0.0);
  float ws = 0.0;
  for (int j = 0; j < 4; j++) {
    ivec2 off = ivec2(j & 1, j >> 1);
    ivec2 q = clamp(ivec2(base) + off, ivec2(0), count - 1);
    float wj = (off.x == 1 ? f.x : 1.0 - f.x) * (off.y == 1 ? f.y : 1.0 - f.y);
    if (!open && !reaches(w, (vec2(q) + 0.5) * uFluSpacing)) continue;
    s += wj * texelFetch(uFluence, q, 0).rgb;
    ws += wj;
  }
  return ws > 1e-4 ? s / ws : vec3(0.0);
}`;
