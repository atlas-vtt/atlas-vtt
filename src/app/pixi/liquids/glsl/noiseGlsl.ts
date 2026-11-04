import { MOTION_LOOP, PATTERN_TILE } from '../liquidMotion';

/**
 * The patterns every liquid is made of. Lattice noise and cells whose lattice repeats every
 * `period` (whole numbers; a pattern of frequency f over cells repeats every TILE cells when its
 * period is TILE · f), so the drifts may arrive wrapped to TILE; pulses complete whole cycles in
 * LOOP seconds, so the clock may arrive wrapped to LOOP. `px` is how much of a pattern's unit one
 * screen pixel covers: detail finer than about two pixels fades out, never aliases.
 */
export const NOISE_GLSL = `
const float LOOP = ${MOTION_LOOP.toFixed(1)};
const float TILE = ${PATTERN_TILE.toFixed(1)};
const float TAU = 6.28318530718;

/** The fraction of a cycle a pulse of k whole cycles per loop has reached. */
float cycles(float k) { return fract(uTime * (k / LOOP)); }

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

/** How much of a pattern of wavelength \`wave\` can be shown where one screen pixel covers \`px\` of it. */
float shown(float wave, float px) { return 1.0 - smoothstep(0.25, 0.5, px / wave); }

/** Gradient noise about 0 (within ±0.7). */
float gnoise(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, period) + uSeed;
  vec2 i1 = mod(i + 1.0, period) + uSeed;
  float a = dot(hash22(i0) * 2.0 - 1.0, f);
  float b = dot(hash22(vec2(i1.x, i0.y)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(vec2(i0.x, i1.y)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i1) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Fractal noise of up to five octaves; octaves finer than the screen shows fade out. */
float fbm(vec2 p, vec2 period, int octaves, float px) {
  float sum = 0.0;
  float amp = 0.5;
  for (int o = 0; o < 5; o++) {
    float visible = shown(1.0, px);
    // Finer octaves would fade out further still.
    if (o >= octaves || visible <= 0.0) break;
    sum += amp * visible * gnoise(p, period);
    p = p * 2.0 + vec2(13.0, 7.0);
    period *= 2.0;
    px *= 2.0;
    amp *= 0.5;
  }
  return sum;
}

/** A cell's point, circling \`churn\` around its place once or twice a loop. */
vec2 cellPoint(vec4 h, float churn) {
  float turns = floor(1.0 + h.z * 2.0);
  float phase = TAU * (cycles(turns) + h.w);
  return 0.15 + 0.7 * h.xy + churn * vec2(sin(phase), cos(phase + h.z * TAU));
}

/**
 * Cells around points: x the distance to the nearest point, y the distance to the edge between
 * its cell and the next (measured across that edge, so lines of even width), z the nearest's own number.
 */
vec3 voronoi(vec2 p, vec2 period, float churn) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float best = 8.0;
  vec2 nearest = vec2(0.0);
  vec2 nearestCell = vec2(0.0);
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec4 h = hash42(mod(i + cell, period) + uSeed);
      vec2 r = cell + cellPoint(h, churn) - f;
      float dist = dot(r, r);
      if (dist < best) { best = dist; nearest = r; nearestCell = cell; id = h.w; }
    }
  }
  // The cells around the nearest one hold every edge of its cell: no point strays far enough from its own.
  float edge = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = nearestCell + vec2(float(x), float(y));
      vec4 h = hash42(mod(i + cell, period) + uSeed);
      vec2 r = cell + cellPoint(h, churn) - f;
      vec2 between = r - nearest;
      if (dot(between, between) > 1e-5) edge = min(edge, dot(0.5 * (nearest + r), normalize(between)));
    }
  }
  return vec3(sqrt(best), edge, id);
}

/** As \`voronoi\`, in one pass: y is half the gap between the nearest two points, the edge's distance where they face each other, a little less elsewhere. Half the cost; for fine nets. */
vec3 voronoiFast(vec2 p, vec2 period, float churn) {
  vec2 i = floor(p);
  vec2 f = p - i;
  float f1 = 8.0;
  float f2 = 8.0;
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec4 h = hash42(mod(i + cell, period) + uSeed);
      vec2 r = cell + cellPoint(h, churn) - f;
      float dist = dot(r, r);
      if (dist < f1) { f2 = f1; f1 = dist; id = h.w; }
      else if (dist < f2) { f2 = dist; }
    }
  }
  f1 = sqrt(f1);
  return vec3(f1, (sqrt(f2) - f1) * 0.5, id);
}
`;
