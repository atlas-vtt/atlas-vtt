import { GLSL_VERSION } from './glsl';
import { AREA_OUTLINE_GLSL } from './areaTileShader';
import { LIGHT_FALLOFF_GLSL } from './lightMapShader';
import { WEDGE_GLSL } from './wedges';
import { BAND_GLSL } from './wallBandShader';

/** Texels over which a light rises from nothing on a shadow's edge to the lit half of its penumbra: fewer show the texel grid's steps. */
const SHADOW_EDGE_TEXELS = 1.5;

/** A polygon in world pixels (`aPosition`), drawn into a target that covers `uTargetRect` of the world. */
export const polygonVertex = `${GLSL_VERSION}
in vec2 aPosition;
uniform vec4 uTargetRect;
void main() {
  gl_Position = vec4((aPosition - uTargetRect.xy) / uTargetRect.zw * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The world point of the texel being drawn, the centre of its square: from its place in the
 * target, never interpolated across a polygon's triangles, so every polygon that covers a texel
 * lights it at the same point and the walls' band is read at that texel.
 */
const TEXEL_CENTRE_GLSL = `
uniform vec4 uTargetRect;
vec2 texelCentre() {
  return uTargetRect.xy + gl_FragCoord.xy * uTexel;
}`;

/**
 * A light as the polygon picture draws it into the light map (`PolygonLightMap`): its reach, the
 * polygon the rule counts (a fan from the light, cut by the walls and the beam), lit with the
 * traced picture's falloff (`LIGHT_FALLOFF_GLSL`) in the light's colour, alpha its luminance at the
 * bright level, added to the lights before it. Its shadows' edges fade inside it as the lit half
 * of a flame's penumbra does, half the light on the shadow's edge, rising from nothing there over
 * a texel and a half so no edge shows the texel grid's steps (`WEDGE_GLSL`): soft, never past the
 * rule's edge, and dark only along it. The reach ends on the walls' centre lines, so the
 * texels of the walls' band (`BAND_GLSL`) are left out, and those beside it take only their share
 * (`wallShade`): no bilinear read carries the light across, and it ends along a wall smoothly.
 */
export const polygonLightFragment = `${GLSL_VERSION}
out vec4 finalColor;
${LIGHT_FALLOFF_GLSL}
${TEXEL_CENTRE_GLSL}
${BAND_GLSL}
${WEDGE_GLSL}
void main() {
  vec2 vWorld = texelCentre();
  float shade = wallShade(vWorld);
  if (shade <= 0.0) discard;
  float d = distance(vWorld, uLight);
  vec2 light = lightAt(d);
  float direct = wedgeShare(vWorld, uLight, light.x * shade, ${SHADOW_EDGE_TEXELS.toFixed(2)} * uTexel);
  if (uCone.z < 3.14159) direct *= inCone(vWorld - uLight, d);
  finalColor = vec4(uLightColor * direct, dot(uLightColor, LUMA) * direct * light.y);
}`;

/**
 * An area light's picture (`AreaLightPictures`, `rg16float` over the texels around it): its area
 * and the reaches of its outline the rule counts (`LightReach.parts`), each a fan, max-blended, so
 * a texel two parts cover is lit once, with the falloff from the area's outline (`uCorners`): red
 * the light before its colour, green that at the bright level. The walls' band is left out, as a
 * light's reach leaves it out (`polygonLightFragment`).
 */
export const areaPictureFragment = `${GLSL_VERSION}
out vec4 finalColor;
${LIGHT_FALLOFF_GLSL}
${AREA_OUTLINE_GLSL}
${TEXEL_CENTRE_GLSL}
${BAND_GLSL}
void main() {
  vec2 vWorld = texelCentre();
  float shade = wallShade(vWorld);
  if (shade <= 0.0) discard;
  vec2 nearest;
  vec2 light = lightAt(max(outlineDistance(vWorld, nearest), 0.0));
  finalColor = vec4(light.x * shade, light.x * light.y * shade, 0.0, 1.0);
}`;

/**
 * An area light's picture added into the light map in its colour, on the quad over the picture's
 * rect (`lightMapVertex`), which lies on the light map's texel grid: a texel here is a texel there.
 */
export const areaLightFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform vec4 uRect;
uniform float uTexel;
uniform vec3 uLightColor;
uniform sampler2D uPicture;
out vec4 finalColor;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
void main() {
  ivec2 texel = ivec2(floor((vWorld - uRect.xy) / uTexel));
  if (any(lessThan(texel, ivec2(0))) || any(greaterThanEqual(texel, textureSize(uPicture, 0)))) discard;
  vec2 light = texelFetch(uPicture, texel, 0).rg;
  finalColor = vec4(uLightColor * light.x, dot(uLightColor, LUMA) * light.y);
}`;
