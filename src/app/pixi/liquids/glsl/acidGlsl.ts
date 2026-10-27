/**
 * Acid is pigment over the illustration, never added light. Broad, slow currents disturb a
 * stained meniscus; sparse bubbles stretch, swell and open into broken rings. Engraved maps
 * express both in their own ink, with hatch density in place of smooth surface modelling.
 * Three / two / one noise octaves at high / balanced / saver, one field sample, no extra pass.
 */
export const ACID_GLSL = `
vec4 acid(vec2 q, float d, float px, float near) {
  float current = fbm((q - uDriftA.xy) * 0.75, vec2(TILE * 0.75), int(uDetail) + 1, px * 0.75);
  float bank = 1.0 - smoothstep(0.08, 0.32, d + current * 0.06);

  // One candidate per jittered cell, fewer than the old 3x3 lattice. A new location at each
  // birth, changed only while invisible; integer paces and wrapped epochs keep LOOP seamless.
  vec2 b = (q - uDriftB.xy) * 1.5;
  vec2 cell = floor(b);
  vec4 h = hash42(mod(cell, vec2(TILE * 1.5)) + uSeed + 17.0);
  float pace = floor(mix(340.0, 700.0, h.z));
  float age = uTime * (pace / LOOP) + h.w;
  float life = fract(age);
  float epoch = mod(floor(age), pace);
  vec4 birth = hash42(h.xy * 71.0 + epoch + 3.0);
  vec2 at = b - cell - (0.28 + 0.44 * birth.xy);
  at *= vec2(1.0 + birth.z * 0.12, 0.92 + birth.w * 0.12);
  float size = mix(0.075, 0.18, birth.z);
  float pop = smoothstep(0.74, 0.97, life);
  float radius = size * (0.22 + 0.78 * smoothstep(0.04, 0.72, life) + pop * 0.35);
  float dist = length(at);
  float aa = max(px * 1.5, 0.001);
  float width = 0.009 * 1.5;
  float rim = 1.0 - smoothstep(width * 0.5, width * 0.5 + aa, abs(dist - radius));
  float dome = 1.0 - smoothstep(radius - aa, radius + aa, dist);
  float live = smoothstep(0.04, 0.18, life) * (1.0 - smoothstep(0.78, 0.98, life));
  float has = step(birth.w, 0.62) * smoothstep(0.10, 0.32, d) * shown(size, px * 1.5);
  // The stretched skin opens on one side, then settles. No one-frame jump at the pop.
  rim *= 1.0 - pop * smoothstep(-0.3, 0.7, at.x / max(radius, 0.001));
  float bubble = live * has;

  if (uEngraved > 0.5) {
    // Static art uses a 45-degree burin hatch. Keep it still, let density breathe in slow
    // patches, and cut a fine meniscus with the same ink. Never wash a gradient over paper.
    vec2 paper = vWorld / uCell;
    float hatchAt = (paper.x - paper.y) * 22.0 + current * 0.14;
    float hatch = 1.0 - smoothstep(0.10, 0.10 + px * 31.0, abs(fract(hatchAt) - 0.5));
    hatch *= shown(1.0 / 31.0, px);
    float stain = hatch * bank * 0.14;
    float outline = rim * bubble * 0.7;
    float alpha = clamp(stain + outline, 0.0, 0.78);
    return vec4(uDeep * alpha, alpha);
  }

  // Thin pigment layers let the painter's paper, depth and existing bubbles show through.
  float wash = 0.025 + bank * 0.12 + smoothstep(-0.18, 0.23, current) * 0.035;
  vec3 colour = mix(uDeep, uSurface, 0.18 + current * 0.22) * wash;
  float body = dome * bubble * (1.0 - smoothstep(0.70, 0.83, life)) * 0.07;
  float edge = rim * bubble * 0.48;
  float litSide = smoothstep(-0.8, 0.65, -(at.x + at.y) / max(radius, 0.001));
  vec3 pigment = mix(uDeep, uGlint, 0.35 + litSide * 0.5);
  colour = colour * (1.0 - body) + uSurface * body;
  float alpha = wash * (1.0 - body) + body;
  colour = colour * (1.0 - edge) + pigment * edge;
  alpha = alpha * (1.0 - edge) + edge;
  return vec4(colour, alpha);
}
`;
