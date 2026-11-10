import { GLSL_VERSION } from './glsl';

/**
 * How much the composite's picture shows of the map at a pixel, whatever the map's colour there
 * (`shownGlsl`): the light where the party perceives the map now (also what a sense perceives
 * without light), the memory's dim level where it remembers it, nothing where it does neither.
 * Written in the alpha of a composite worked out on fewer pixels than the render's, as
 * `sqrt(e / (1 + e))`: 8 bits keep exact zeros, and the dark end, where light fades out, keeps
 * its steps small.
 */
export const SHOWN_GLSL = `
// The brightness of the memory as the players' picture shows it (\`remembered\`).
const float MEMORY_SHOWN = 0.07;
float shownEncoded(float shown) {
  float e = max(shown, 0.0);
  return sqrt(e / (1.0 + e));
}`;

/**
 * Draws a composite worked out on fewer pixels (`uReduced`, `uReducedRatio` of its pixels per
 * screen pixel; its last texel `uReducedLast`) up to the render's pixels. Each pixel blends the
 * four texels around it as a bilinear filter would, but darkness wins: a texel that shows much
 * more of the map than the darkest of the four (alpha: `SHOWN_GLSL`) takes no part, so where any
 * of the four shows nothing, the pixel shows only what those show. Light and sight therefore
 * never reach a pixel further than the full composite would let them, and stop up to a texel
 * short; inside a lit area, where the four show as much, only the map is softer.
 */
export const compositeUpscaleFragment = `${GLSL_VERSION}
in vec2 vTextureCoord;
out vec4 finalColor;
uniform vec4 uInputSize;
uniform sampler2D uReduced;
uniform float uReducedRatio;
uniform vec2 uReducedLast;

float shownOf(vec4 texel) {
  float a = texel.a * texel.a;
  return a / max(1.0 - a, 1e-4);
}

// 1 for a texel as dark as the darkest, fading to 0 for one that shows twice as much or more.
float keeps(float shown, float darkest) {
  return shown <= darkest ? 1.0 : smoothstep(0.5, 0.75, darkest / shown);
}

void main() {
  vec2 p = vTextureCoord * uInputSize.xy * uReducedRatio - 0.5;
  vec2 base = floor(p);
  vec2 f = p - base;
  ivec2 last = ivec2(uReducedLast);
  ivec2 at = ivec2(base);
  vec4 t00 = texelFetch(uReduced, clamp(at, ivec2(0), last), 0);
  vec4 t10 = texelFetch(uReduced, clamp(at + ivec2(1, 0), ivec2(0), last), 0);
  vec4 t01 = texelFetch(uReduced, clamp(at + ivec2(0, 1), ivec2(0), last), 0);
  vec4 t11 = texelFetch(uReduced, clamp(at + ivec2(1, 1), ivec2(0), last), 0);
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 e = vec4(shownOf(t00), shownOf(t10), shownOf(t01), shownOf(t11));
  // Only the texels the pixel takes anything of count towards the darkest.
  // Not mix(big, e, ...): ANGLE turns mix into HLSL's lerp, x + a * (y - x), whose e - 1e9 drops e,
  // so on Direct3D every counted texel read as 0 and the whole picture went black.
  vec4 counted = e + (1.0 - step(1e-6, w)) * 1e9;
  float darkest = min(min(counted.x, counted.y), min(counted.z, counted.w));
  w *= vec4(keeps(e.x, darkest), keeps(e.y, darkest), keeps(e.z, darkest), keeps(e.w, darkest));
  vec3 color = (t00.rgb * w.x + t10.rgb * w.y + t01.rgb * w.z + t11.rgb * w.w) / max(dot(w, vec4(1.0)), 1e-6);
  finalColor = vec4(color, 1.0);
}`;
