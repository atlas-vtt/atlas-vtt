import { REFLECTION, TILE_SMOOTH } from '../../../lighting/lightingConstants';
import { FADE_GLSL, GLSL_VERSION, fieldGlsl } from './glsl';

/**
 * A light's reflection (`ReflectionTiles`): every point it is traced from (`ReflectionPart`) as a
 * fan of its polygon, in world pixels, drawn into the reflection's own rectangle
 * (`uReflectRect`). `aPart` is the point, how far the rule counts its light and how lit its floor is.
 */
export const reflectionVertex = `${GLSL_VERSION}
in vec2 aPosition;
in vec4 aPart;
uniform vec4 uReflectRect;
out vec2 vWorld;
out vec4 vPart;
void main() {
  vWorld = aPosition;
  vPart = aPart;
  gl_Position = vec4((aPosition - uReflectRect.xy) / uReflectRect.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

// The share of the reflection's light a texel gets from one point: its floor's strength next to
// the point, fading as a light does (`FADE_GLSL`) over the last `REFLECTION.fade` of the part's
// reach to nothing where the rule stops counting it. The fans are max-blended, so a texel takes
// the brightest point that sees it. Like a light's tile, nothing is drawn within a wall's capsule
// (the trace's clearance): its centre line is where the polygons end, and a bilinear read of the
// light map must never carry light across it. The composite lights the capsule's edge from the
// floor in front of it.
export const reflectionFragment = `${GLSL_VERSION}
in vec2 vWorld;
in vec4 vPart;
${fieldGlsl('uField')}
${FADE_GLSL}
out vec4 finalColor;
void main() {
  if (uFieldClearance(vWorld) < 0.02) discard;
  float u = distance(vWorld, vPart.xy) / max(vPart.z, 1e-3);
  finalColor = vec4(vPart.w * fadeOf((1.0 - u) / ${REFLECTION.fade.toFixed(4)}), 0.0, 0.0, 1.0);
}`;

/** Most texels a reflection is blurred over to either side (`reflectionBlurFragment`): as far as a light's tile is smoothed, its allowance past what the rule counts. */
export const REFLECTION_BLUR_TEXELS = TILE_SMOOTH;

/**
 * One direction (`uStep`) of the blur that melts a reflection's tile (`uSource`, over
 * `uReflectRect`): each point it is traced from casts its own hard shadows, so the brightest of
 * them steps where one stops seeing past a corner and the next takes over. A Gaussian over at most
 * `uRadius` texels to either side, and no farther than the texel's clearance from the walls: that
 * stretch holds no wall, so the blur never carries light across one (it may bend round a wall's end
 * by twice the clearance, as light does). Near walls it shrinks to nothing.
 */
export const reflectionBlurFragment = `${GLSL_VERSION}
uniform sampler2D uSource;
uniform vec4 uReflectRect;
uniform vec2 uStep;
uniform float uRadius;
uniform float uTexel;
${fieldGlsl('uField')}
out vec4 finalColor;
void main() {
  ivec2 here = ivec2(gl_FragCoord.xy);
  ivec2 last = textureSize(uSource, 0) - 1;
  vec2 w = uReflectRect.xy + (vec2(here) + 0.5) * uTexel;
  float reach = min(uRadius, max(uFieldClearance(w), 0.0) / uTexel);
  float sigma = max(uRadius * 0.5, 1.0);
  float sum = texelFetch(uSource, here, 0).r;
  float weights = 1.0;
  ivec2 step = ivec2(uStep);
  for (int i = 1; i <= ${REFLECTION_BLUR_TEXELS}; i++) {
    float f = float(i);
    if (f > reach) break;
    float k = exp(-f * f / (2.0 * sigma * sigma));
    sum += k * (texelFetch(uSource, clamp(here + step * i, ivec2(0), last), 0).r + texelFetch(uSource, clamp(here - step * i, ivec2(0), last), 0).r);
    weights += 2.0 * k;
  }
  finalColor = vec4(sum / weights, 0.0, 0.0, 1.0);
}`;
