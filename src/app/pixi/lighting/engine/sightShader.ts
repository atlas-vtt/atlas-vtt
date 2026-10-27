import { SENSE_FADE } from '../../../lighting/lightingConstants';
import { DISC_SHARE_GLSL, FADE_GLSL, GLSL_VERSION } from './glsl';

/** Wedges a fragment tests at most; more corners than this per token stay hard. */
export const MAX_WEDGES = 256;

export const sightVertex = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  vWorld = aPosition;
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}`;

// Inside the polygon; each wedge (corner a, edge e, side, angle phi) fades sight from 0 on the
// shadow edge to 1 at its inner side, following the viewer's round footprint. A sense with a range
// (`uFade`: its origin and range, a range of 0 for none) fades over the last `SENSE_FADE` of it to
// nothing at its edge, as a light fades within its dim radius (`FADE_GLSL`). Only ever lowers.
export const sightFragment = `${GLSL_VERSION}
in vec2 vWorld;
uniform sampler2D uWedges;
uniform int uWedgeCount;
uniform vec4 uChannel;
uniform vec3 uFade;
out vec4 finalColor;
${DISC_SHARE_GLSL}
${FADE_GLSL}
void main() {
  float seen = 1.0;
  if (uFade.z > 0.0) seen = fadeOf((uFade.z - distance(vWorld, uFade.xy)) / (uFade.z * ${SENSE_FADE.toFixed(4)}));
  for (int i = 0; i < ${MAX_WEDGES}; i++) {
    if (i >= uWedgeCount) break;
    vec4 ae = texelFetch(uWedges, ivec2(i, 0), 0);
    vec2 sp = texelFetch(uWedges, ivec2(i, 1), 0).xy;
    vec2 v = vWorld - ae.xy;
    float theta = atan(sp.x * (ae.z * v.y - ae.w * v.x), dot(ae.zw, v));
    if (theta >= 0.0 && theta < sp.y) seen *= discShare(2.0 * theta / sp.y - 1.0);
  }
  finalColor = uChannel * seen;
}`;
