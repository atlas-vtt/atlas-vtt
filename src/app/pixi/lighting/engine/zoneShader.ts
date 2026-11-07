import { MAX_ZONE_CORNERS } from '../../../lighting/lightZones';
import { GLSL_VERSION, TRACE_GLSL, fieldGlsl } from './glsl';
import { BAND_GLSL } from './wallBandShader';

/**
 * A zone's polygon (`uPoints`, `uCount` corners), its light and how far onto the walls it lies,
 * and for a point whether it lies inside (even-odd) and how far the outline's nearest point is.
 */
const ZONE_OUTLINE_GLSL = `
uniform vec2 uPoints[${MAX_ZONE_CORNERS}];
uniform int uCount;
uniform float uSoft;
uniform float uOnWalls;
uniform float uWallReach;
uniform vec3 uZoneLight;
float zoneOutline(vec2 p, out bool inside, out vec2 nearest) {
  inside = false;
  float best = 1e20;
  nearest = p;
  for (int i = 0; i < ${MAX_ZONE_CORNERS}; i++) {
    if (i >= uCount) break;
    vec2 a = uPoints[i];
    vec2 b = uPoints[i + 1 == uCount ? 0 : i + 1];
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    vec2 q = a + ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = distance(p, q);
    if (d < best) {
      best = d;
      nearest = q;
    }
  }
  return best;
}`;

/**
 * One ambient zone over the rectangle around it (`lightMapVertex`), written premultiplied, so
 * zones drawn in their order lie over each other as the rule has them: `uZoneLight` (the zone's
 * ambient light in linear light) times its share, and the share in alpha. Inside the polygon
 * (`uPoints`, `uCount` corners) the share is 1: there the rule counts the zone. Past the outline
 * it falls to 0 over `uSoft` world pixels, where the nearest point of the outline is in plain
 * view: the trace stops at walls, so the soft edge never lies behind one, and passes a doorway.
 *
 * Like a light's tile, that ends at a wall's capsule: a zone drawn on its room's walls must not
 * lie on their far half, nor on a texel the composite reads there. The composite gives a wall's
 * face the ambient light of the floor in front of it. A second draw (`uOnWalls`) fills the
 * capsules alone, with the zones darker than the scene: there a zone has no soft edge and lies
 * up to `uWallReach` past its outline, so the wall a dark zone ends at is dark through and through.
 */
export const zoneFragment = `${GLSL_VERSION}
in vec2 vWorld;
out vec4 finalColor;
${ZONE_OUTLINE_GLSL}
${fieldGlsl('uField')}
float clearance(vec2 w) { return uFieldClearance(w); }
${TRACE_GLSL}
void main() {
  bool onWall = clearance(vWorld) <= 0.0;
  if (onWall != (uOnWalls > 0.5)) discard;
  bool inside;
  vec2 nearest;
  float best = zoneOutline(vWorld, inside, nearest);
  float share = 1.0;
  if (onWall) {
    if (!inside && best >= uWallReach) discard;
  } else if (!inside) {
    if (best >= uSoft || !reaches(vWorld, nearest)) discard;
    float u = 1.0 - best / uSoft;
    share = u * u * (3.0 - 2.0 * u);
  }
  finalColor = vec4(uZoneLight * share, share);
}`;

/**
 * One ambient zone as the polygon picture draws it (`PolygonWorld`): a flat fill of its polygon,
 * share 1 inside and nothing outside, as the rule counts it. The composite reads the zone map at
 * the texel a pixel lies in. The walls are the band of texels around them (`WallBand`, read on
 * this map's own texel grid): the floor draw leaves the band out, so a zone's light ends a band
 * short of a wall it ends at, and the second draw (`uOnWalls`) fills the band with the zones
 * darker than the scene up to `uWallReach` past their outline (half a texel's diagonal: as far as
 * a pixel inside the zone finds the centre of the texel it lies in), so the wall a dark zone ends
 * at is dark to its centre line and its darkness reaches no further than that read beyond.
 */
export const flatZoneFragment = `${GLSL_VERSION}
in vec2 vWorld;
out vec4 finalColor;
${ZONE_OUTLINE_GLSL}
${BAND_GLSL}
void main() {
  bool onWall = onBand(vWorld);
  if (onWall != (uOnWalls > 0.5)) discard;
  bool inside;
  vec2 nearest;
  float best = zoneOutline(vWorld, inside, nearest);
  if (!inside && (!onWall || best >= uWallReach)) discard;
  finalColor = vec4(uZoneLight, 1.0);
}`;
