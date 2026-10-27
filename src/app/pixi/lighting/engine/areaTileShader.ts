import { MAX_AREA_CORNERS } from '../../../lighting/lightArea';
import { LIGHT_FADE_MIN, TILE_RAYS } from '../../../lighting/lightingConstants';
import { FADE_GLSL, GLSL_VERSION, MAX_STEPS } from './glsl';
import { TILE_CLEARANCE_GLSL } from './tileShader';

/** vec4s that hold an area light's corners, two to each. */
export const AREA_CORNER_VECTORS = MAX_AREA_CORNERS / 2;

/**
 * An area light's outline (`uCorners`, two corners to a vec4, `uCount` of them) and the distance
 * from a point to it: the corner, the nearest point and whether the point lies inside (even-odd,
 * as `pointInPolygon` counts).
 */
const AREA_OUTLINE_GLSL = `
uniform vec4 uCorners[${AREA_CORNER_VECTORS}];
uniform int uCount;
vec2 corner(int i) {
  vec4 pair = uCorners[i / 2];
  return (i % 2 == 0) ? pair.xy : pair.zw;
}
// The signed distance from p to the outline (negative inside), and the outline's nearest point.
float outlineDistance(vec2 p, out vec2 nearest) {
  bool inside = false;
  float best = 1e20;
  nearest = p;
  vec2 a = corner(uCount - 1);
  for (int i = 0; i < ${MAX_AREA_CORNERS}; i++) {
    if (i >= uCount) break;
    vec2 b = corner(i);
    if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    vec2 ab = b - a;
    vec2 q = a + ab * clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = distance(p, q);
    if (d < best) {
      best = d;
      nearest = q;
    }
    a = b;
  }
  return inside ? -best : best;
}`;

/**
 * The signed distance from each tile texel's centre to an area light's outline, in world pixels
 * (`r16float`, negative inside): what the light map's falloff and the tile's rays read.
 */
export const areaDistanceFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform vec4 uTileRect;
out vec4 finalColor;
${AREA_OUTLINE_GLSL}
void main() {
  vec2 nearest;
  finalColor = vec4(outlineDistance(uTileRect.xy + vUv * uTileRect.zw, nearest), 0.0, 0.0, 1.0);
}`;

/**
 * Share of an area light each texel sees: rays from the texel, spread evenly over the angle the
 * area fills as seen from it (all around where it wraps round the texel) and jittered within
 * their strip, march towards the area (`uDistance`, the signed distance field of its outline)
 * through the wall field. A ray that reaches the area within `uAreaReach` counts with the light's
 * own falloff at the distance it met the area (bright, knee, fade), so near parts of the area
 * weigh more than far ones; it is lit where no wall stopped it first. Sphere tracing never steps
 * past a wall's capsule (steps never exceed its conservative clearance), so the tile is
 * leak-proof as a point light's is. Inside the area every texel outside the walls sees it whole.
 * This is the raw tile: `tileSmoothFragment` smooths it.
 */
export const areaTileFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform vec4 uTileRect;
uniform float uTexel;
uniform float uRays;
uniform float uAreaBright;
uniform float uAreaDim;
uniform float uAreaReach;
uniform float uBrightLevel;
uniform float uDimLevel;
uniform sampler2D uDistance;
out vec4 finalColor;
${TILE_CLEARANCE_GLSL}
${AREA_OUTLINE_GLSL}

// The area's distance at w, never more than it is: bilinear reads of a distance field run over by
// less than three quarters of a texel. Outside the tile there is no area to meet.
float areaDistance(vec2 w) {
  vec2 lo = uTileRect.xy;
  vec2 hi = lo + uTileRect.zw;
  if (any(lessThan(w, lo)) || any(greaterThan(w, hi))) return 1e20;
  return textureLod(uDistance, (w - lo) / uTileRect.zw, 0.0).r - 0.75 * uTexel;
}

${FADE_GLSL}

// The light's own falloff at d from its outline, as the light map draws it (its fade too), without its halo.
float falloff(float d) {
  float t = d / max(uAreaBright, 1.0);
  float t2 = t * t;
  float e = mix(uDimLevel, uBrightLevel, 1.0 / (1.0 + t2 * t2));
  float from = min(uAreaBright, uAreaDim * ${(1 - LIGHT_FADE_MIN).toFixed(4)});
  return e * fadeOf((uAreaDim - d) / max(uAreaDim - from, 1e-3));
}

void main() {
  vec2 p = uTileRect.xy + vUv * uTileRect.zw;
  float vis = 0.0;
  if (clearance(p) > 0.0) {
    vec2 nearest;
    float here = outlineDistance(p, nearest);
    if (here <= 0.0) vis = 1.0;
    else if (here < uAreaReach) {
      // The angle the area fills from p, measured from the direction to its nearest point.
      vec2 ref = normalize(nearest - p + vec2(1e-6, 0.0));
      vec2 side = vec2(-ref.y, ref.x);
      float lo = 0.0;
      float hi = 0.0;
      vec2 v = corner(uCount - 1) - p;
      float previous = atan(dot(v, side), dot(v, ref));
      for (int i = 0; i < ${MAX_AREA_CORNERS}; i++) {
        if (i >= uCount) break;
        v = corner(i) - p;
        float angle = atan(dot(v, side), dot(v, ref));
        // An edge seen across the back of p: the area lies all around it.
        if (abs(angle - previous) > 3.14159265) {
          lo = -3.14159265;
          hi = 3.14159265;
        }
        lo = min(lo, angle);
        hi = max(hi, angle);
        previous = angle;
      }
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      int rays = int(uRays);
      float total = 0.0;
      float seen = 0.0;
      for (int k = 0; k < ${TILE_RAYS}; k++) {
        if (k >= rays) break;
        float angle = mix(lo, hi, (float(k) + jitter) / float(rays));
        vec2 dir = ref * cos(angle) + side * sin(angle);
        float s = 0.0;
        bool blocked = false;
        bool met = false;
        for (int i = 0; i < ${MAX_STEPS}; i++) {
          vec2 w = p + dir * s;
          float a = areaDistance(w);
          if (a <= 0.5 * uTexel) {
            met = true;
            break;
          }
          if (s > uAreaReach) break;
          float step = a;
          if (!blocked) {
            float c = clearance(w);
            if (c < 0.02) blocked = true;
            else step = min(step, c);
          }
          s += max(step, 0.25 * uTexel);
        }
        if (!met || s > uAreaReach) continue;
        float weight = falloff(s);
        total += weight;
        if (!blocked) seen += weight;
      }
      vis = total > 0.0 ? seen / total : 0.0;
    }
  }
  finalColor = vec4(vis, 0.0, 0.0, 1.0);
}`;

/** Most texels a blur of an area light's distance field reaches to either side. */
export const AREA_BLUR_TAPS = 24;

/**
 * One direction of a Gaussian blur of an area light's distance field (`uSource`, the tile's texel
 * grid, `uTexels` of it in its corner), `uStep` one texel along the blur, `uSigma` in texels. The
 * distance to a polygon creases where the nearest point jumps from one edge to another (outside
 * every notch of a lava field's outline), and a falloff read from it shows each crease as a line;
 * blurred, the light rounds those corners as a glowing surface would. Straight shores keep their
 * distance (a blur leaves a ramp as it is). Only the light map reads the blurred field: the
 * tile's rays march through the exact one.
 */
export const areaBlurFragment = `${GLSL_VERSION}
in vec2 vUv;
uniform vec2 uTexels;
uniform vec2 uStep;
uniform float uSigma;
uniform sampler2D uSource;
out vec4 finalColor;
void main() {
  ivec2 here = ivec2(gl_FragCoord.xy);
  ivec2 last = ivec2(uTexels) - 1;
  ivec2 step = ivec2(uStep);
  float sum = texelFetch(uSource, here, 0).r;
  float weights = 1.0;
  int reach = int(min(ceil(3.0 * uSigma), ${AREA_BLUR_TAPS}.0));
  for (int i = 1; i <= ${AREA_BLUR_TAPS}; i++) {
    if (i > reach) break;
    float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
    sum += w * (texelFetch(uSource, clamp(here + step * i, ivec2(0), last), 0).r + texelFetch(uSource, clamp(here - step * i, ivec2(0), last), 0).r);
    weights += 2.0 * w;
  }
  finalColor = vec4(sum / weights, 0.0, 0.0, 1.0);
}`;
