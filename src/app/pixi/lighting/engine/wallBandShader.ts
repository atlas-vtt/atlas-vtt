import { GLSL_VERSION } from './glsl';

/**
 * One wall's band at world point `p`, its centre line `s` (xy to zw): `segmentBand` is 0 where `p`
 * lies within `radius` of it, rising to 1 over `ramp` beyond; `rightOf` is whether `p` lies to the
 * right of it from its first end to its second, a one-way wall's open side (`blockingOnLeft`).
 */
export const SEGMENT_BAND_GLSL = `
bool rightOf(vec2 p, vec4 s) {
  vec2 ab = s.zw - s.xy;
  vec2 ap = p - s.xy;
  return ab.x * ap.y - ab.y * ap.x < 0.0;
}
float segmentBand(vec2 p, vec4 s, float radius, float ramp) {
  vec2 ab = s.zw - s.xy;
  vec2 ap = p - s.xy;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return clamp((length(ap - ab * t) - radius) / ramp, 0.0, 1.0);
}`;

/**
 * The band of a map's texels around its walls (`WallBand`), read on its own texel grid at world
 * point `w`: `wallShade` is how much light a texel there may hold, 0 within the band's radius of a
 * wall that stops light both ways and rising to 1 over a texel and a half beyond it (a one-way
 * wall's is the light's own, `ONE_WAY_BAND_GLSL`); `onBand` is whether the texel lies within
 * that radius of any wall, on either side.
 */
export const BAND_GLSL = `
uniform sampler2D uBand;
uniform float uBandTexel;
vec4 bandTexel(sampler2D band, vec2 w) {
  ivec2 size = textureSize(band, 0);
  return texelFetch(band, clamp(ivec2(floor(w / uBandTexel)), ivec2(0), size - 1), 0);
}
vec2 bandAt(vec2 w) {
  return bandTexel(uBand, w).rg;
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
 * in a smooth slope parallel to it rather than in the steps of the texel grid: red for light
 * (where `uLightBand` is set), green for zones. A one-way wall (`uOneSided`, its blocking side to
 * the left of its first end to its second) has the light's band on that side alone: light from
 * there ends at it and must not be read across it. Whether a light comes from there is the
 * light's own question (`ONE_WAY_BAND_GLSL`), so the band of the polygon picture holds no light's
 * band of a one-way wall, and only the fallback for lights with too many of them to list does.
 * A zone ends at it on both sides.
 */
export const wallBandFragment = `${GLSL_VERSION}
in vec2 vWorld;
flat in vec4 vSegment;
uniform float uRadius;
uniform float uRamp;
uniform float uOneSided;
uniform float uLightBand;
out vec4 finalColor;
${SEGMENT_BAND_GLSL}
void main() {
  bool open = uOneSided > 0.5 && rightOf(vWorld, vSegment);
  float shade = segmentBand(vWorld, vSegment, uRadius, uRamp);
  if (shade >= 1.0) discard;
  finalColor = vec4(open || uLightBand < 0.5 ? 1.0 : shade, shade, 0.0, 1.0);
}`;
