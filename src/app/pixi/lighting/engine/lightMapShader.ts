import { BEAM_EDGE, BEAM_EDGE_TEXELS, LIGHT_FADE_MIN } from '../../../lighting/lightingConstants';
import { FADE_GLSL, GLSL_VERSION } from './glsl';

export const lightMapVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uRect;
uniform vec2 uMapWorld;
out vec2 vWorld;
void main() {
  vWorld = uRect.xy + aPosition * uRect.zw;
  gl_Position = vec4(vWorld / uMapWorld * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * A light's falloff, as both pictures draw it: what `lightMapFragment` describes, for a point at
 * `d` world pixels from the flame (an area light: from its outline). `lightAt` gives the light
 * there before what blocks it (x) and how much brighter it would be at its bright level (y);
 * `inCone` the share a beam leaves it (`uCone`, `uEdge`, never under a texel `uTexel` of the map).
 */
export const LIGHT_FALLOFF_GLSL = `
uniform vec2 uLight;
uniform float uBright;
uniform float uDim;
uniform float uIntensity;
uniform vec3 uLightColor;
uniform float uBrightLevel;
uniform float uDimLevel;
uniform float uHaloGain;
uniform float uHaloSize;
uniform float uTexel;
uniform vec4 uCone;
uniform float uEdge;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
${FADE_GLSL}
// The width of the beam's soft edge at d from the light (beamEdge).
float edgeAt(float d) {
  return max(min(uEdge, max(${BEAM_EDGE_TEXELS.toFixed(2)} * uTexel, ${BEAM_EDGE.toFixed(4)} * d * sin(min(uCone.z, 3.14159265 - uCone.z)))), 1e-3);
}
// The share of the light a point at v from the light gets by where the light faces.
float inCone(vec2 v, float d) {
  float inside = uCone.z - acos(clamp(dot(v, uCone.xy) / max(d, 1e-4), -1.0, 1.0));
  // How far inside the cone's nearer side: across it, or as far as the light where the side lies behind it.
  float across = inside <= 0.0 ? 0.0 : (inside < 1.5708 ? d * sin(inside) : d);
  float beam = fadeOf(across / edgeAt(d));
  float own = fadeOf((uCone.w - d) / edgeAt(uCone.w));
  return max(beam, own);
}
vec2 lightAt(float d) {
  float dim = max(uDim, 1.0);
  float t = d / max(uBright, 1.0);
  float t2 = t * t;
  float e = mix(uDimLevel, uBrightLevel, 1.0 / (1.0 + t2 * t2));
  float s = max(max(uBright, dim * 0.25) * uHaloSize, 1.0);
  e += uHaloGain * exp(-(d * d) / (2.0 * s * s));
  float atBright = max(1.0, uBrightLevel / max(e, 1e-4));
  float from = min(uBright, dim * ${(1 - LIGHT_FADE_MIN).toFixed(4)});
  float fade = fadeOf((dim - d) / max(dim - from, 1e-3));
  return vec2(uIntensity * e * fade, atBright);
}`;

// A light shows its two ranges: the bright level up to the bright radius, the dim level beyond,
// joined by a soft knee, 1 / (1 + (d / bright)^4): half way down at the bright radius, without
// an edge a flicker could move. From the bright radius (or, for a light bright nearly to its end,
// `LIGHT_FADE_MIN` of its dim radius before it) the light fades (`FADE_GLSL`) to exactly zero at
// its dim radius, where the rules stop counting it, so it sinks into the dark within what the
// rules count lit and never beyond. A Gaussian halo around the flame adds to the levels before
// the fade and the tile, so it cannot pass a wall; a light without a bright radius sizes it by a
// quarter of its dim radius. Radii are floored at 1 px so an empty light stays finite in the float target.
// The tile is read with texelFetch: its rect sits on this map's texel grid, so a texel here is a
// texel there.
// Alpha holds the luminance the light would have here at its bright level (never less than it
// has): the composite tonemaps a light at that level and scales the result back, so a floor
// shows the dim range at the same share of the bright range whatever its colour.
// A light that shines one way (`uCone`: its facing as a unit vector, half its angle, the radius
// of its own space; half an angle of π or more is no cone) keeps all of this inside its cone and
// within its own space, and fades towards the cone's sides as towards its dim radius, to
// nothing on them: over its edge inside the cone, `uEdge` world pixels, or `BEAM_EDGE` of the
// beam's half-width at that distance where that is less, though never under a texel (`beamEdge`).
// Its own space fades to nothing at its radius over the edge it has there. The tile knows nothing
// of the cone, so turning a light traces nothing.
// An area light (`uIsArea`) counts every distance from its outline instead of from its middle:
// `uDistance` holds the signed distance to it on the tile's texel grid (`areaDistanceFragment`),
// and inside the area, where it is negative, the light is at its brightest, halo and all.
// A light that reflects (`uHasReflection`) adds the light its lit floor gives back
// (`ReflectionTiles`, on this map's texel grid from `uReflectOrigin`): `uReflectLevel` times its
// share there, where it is brighter than the light itself, which is in the shadows. Its alpha is
// taken as a dim range's is (`uReflectLift`, bright over dim), so the tonemap's toe spares it too.
// The quad (`uRect`) covers the tile and the reflection; the tile starts at `uTileOrigin`.
// The colour is `uLightColor`: PIXI sets `uColor` itself, as a vec4, on every mesh shader that declares it.
export const lightMapFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform float uIsArea;
uniform vec2 uTileOrigin;
uniform float uHasReflection;
uniform vec2 uReflectOrigin;
uniform float uReflectLevel;
uniform float uReflectLift;
uniform sampler2D uTile;
uniform sampler2D uDistance;
uniform sampler2D uReflection;
out vec4 finalColor;
${LIGHT_FALLOFF_GLSL}
void main() {
  ivec2 texel = ivec2(floor((vWorld - uTileOrigin) / uTexel));
  bool inTile = all(greaterThanEqual(texel, ivec2(0))) && all(lessThan(texel, textureSize(uTile, 0)));
  float spill = 0.0;
  if (uHasReflection > 0.5) {
    ivec2 bounced = ivec2(floor((vWorld - uReflectOrigin) / uTexel));
    if (all(greaterThanEqual(bounced, ivec2(0))) && all(lessThan(bounced, textureSize(uReflection, 0)))) spill = uIntensity * uReflectLevel * texelFetch(uReflection, bounced, 0).r;
  }
  if (!inTile && spill <= 0.0) discard;
  float direct = 0.0;
  float atBright = 1.0;
  if (inTile) {
    float d = uIsArea > 0.5 ? max(texelFetch(uDistance, texel, 0).r, 0.0) : distance(vWorld, uLight);
    vec2 light = lightAt(d);
    atBright = light.y;
    direct = light.x * texelFetch(uTile, texel, 0).r;
    if (uCone.z < 3.14159) direct *= inCone(vWorld - uLight, d);
  }
  // The reflection fills the shadows: where the light itself is brighter, it is the light.
  float shown = max(direct, spill);
  finalColor = vec4(uLightColor * shown, dot(uLightColor, LUMA) * max(direct * atBright, spill * uReflectLift));
}`;
