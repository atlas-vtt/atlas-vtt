import { GLSL_VERSION } from './glsl';

/**
 * The band of a map's texels around its walls (`WallBand`), read on its own texel grid at world
 * point `w`: `wallShade` is how much light a texel there may hold, 0 within the band's radius of a
 * wall's centre line (one-way walls: on their blocking side) and rising to 1 over a texel and a
 * half beyond it; `onBand` is whether the texel lies within that radius of any wall, on either side.
 */
export const BAND_GLSL = `
uniform sampler2D uBand;
uniform float uBandTexel;
vec2 bandAt(vec2 w) {
  ivec2 size = textureSize(uBand, 0);
  return texelFetch(uBand, clamp(ivec2(floor(w / uBandTexel)), ivec2(0), size - 1), 0).rg;
}
float wallShade(vec2 w) {
  return bandAt(w).r;
}
bool onBand(vec2 w) {
  return bandAt(w).g < 0.5 / 255.0;
}`;

/**
 * One wall's share of the band, on the quad `capsuleFieldVertex` places around it (`uMax` the
 * radius and the ramp beyond it), min-blended: 0 at every texel whose centre lies within `uRadius`
 * of the wall's centre line, rising linearly to 1 over `uRamp` beyond, so light ends along a wall
 * in a smooth slope parallel to it rather than in the steps of the texel grid: red for light,
 * green for zones. A one-way wall (`uOneSided`, its blocking side to the left of its first end to
 * its second) has the light's band on that side alone: light from there ends at it and must not be
 * read across it, while light from the other side passes it. A zone ends at it on both sides.
 */
export const wallBandFragment = `${GLSL_VERSION}
in vec2 vWorld;
flat in vec4 vSegment;
uniform float uRadius;
uniform float uRamp;
uniform float uOneSided;
out vec4 finalColor;
void main() {
  vec2 ab = vSegment.zw - vSegment.xy;
  vec2 ap = vWorld - vSegment.xy;
  bool open = uOneSided > 0.5 && ab.x * ap.y - ab.y * ap.x < 0.0;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float shade = clamp((length(ap - ab * t) - uRadius) / uRamp, 0.0, 1.0);
  if (shade >= 1.0) discard;
  finalColor = vec4(open ? 1.0 : shade, shade, 0.0, 1.0);
}`;
