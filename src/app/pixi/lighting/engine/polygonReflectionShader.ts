import { REFLECTION } from '../../../lighting/lightingConstants';
import { FADE_GLSL, GLSL_VERSION } from './glsl';
import { ONE_WAY_BAND_GLSL } from './oneWayBand';
import { BAND_GLSL } from './wallBandShader';

/**
 * A light's reflection as the polygon picture draws it (`ReflectionPictures`), on the fans
 * `reflectionVertex` places: each point it is traced from (`ReflectionPart`, `vPart`) lights its
 * polygon as the traced picture's tile does (`reflectionFragment`), its floor's strength fading over
 * the last `REFLECTION.fade` of its reach to nothing where the rule stops counting it, times the
 * reflection's level and the light's intensity, max-blended. Red is the light before its colour,
 * green that at the bright level, taken as a dim range's (`uLift`), as the traced light map does,
 * so the picture is added as an area light's is (`areaLightFragment`). Read at the texel's centre,
 * and the walls' band is left out as a light's reach leaves it out (`polygonLightFragment`): no
 * bilinear read carries it across a wall.
 */
export const polygonReflectionFragment = `${GLSL_VERSION}
in vec4 vPart;
uniform vec4 uReflectRect;
uniform float uTexel;
uniform float uIntensity;
uniform float uLevel;
uniform float uLift;
${BAND_GLSL}
${ONE_WAY_BAND_GLSL}
${FADE_GLSL}
out vec4 finalColor;
void main() {
  vec2 w = uReflectRect.xy + gl_FragCoord.xy * uTexel;
  float shade = min(wallShade(w), oneWayShade(w));
  if (shade <= 0.0) discard;
  float u = distance(w, vPart.xy) / max(vPart.z, 1e-3);
  float spill = uIntensity * uLevel * vPart.w * fadeOf((1.0 - u) / ${REFLECTION.fade.toFixed(4)}) * shade;
  finalColor = vec4(spill, spill * uLift, 0.0, 1.0);
}`;

/**
 * The light's own reach over its reflection's picture, min-blended to nothing: where the light
 * lights the floor itself, the rule counts that and not the reflection (`lightLevelAt`), and the
 * light map draws the light there (`polygonLightFragment`), so the reflection fills only the shadows.
 */
export const reflectionCutFragment = `${GLSL_VERSION}
out vec4 finalColor;
void main() {
  finalColor = vec4(0.0);
}`;
