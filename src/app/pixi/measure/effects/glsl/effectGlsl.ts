/**
 * What every look shares, after the liquids' patterns (`NOISE_GLSL`): one colour's lights and
 * darks, how far inside its outline a pixel lies, noise along a line and around a ring, and sparks
 * that live and die in places of their own. Each look returns premultiplied colour that may exceed
 * its alpha: alpha tints the map beneath in the look's pigment, colour beyond it glows.
 */
export const EFFECT_GLSL = `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

/** Smooth noise along a line, about 0 (within ±0.5). */
float lineNoise(float x) {
  float i = floor(x);
  float f = x - i;
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f)) - 0.5;
}

/** The same around a ring of \`count\` steps, so it closes on itself. */
float ringNoise(float x, float count, float salt) {
  float i = floor(x);
  float f = x - i;
  return mix(hash11(mod(i, count) + salt), hash11(mod(i + 1.0, count) + salt), f * f * (3.0 - 2.0 * f)) - 0.5;
}

/** The area's colour lifted towards white by \`share\`. */
vec3 lifted(float share) { return mix(uTint, vec3(1.0), share); }

/** The area's colour deepened along its own hue (\`power\` above 1) or brightened along it (below 1). */
vec3 deepened(float power) { return pow(max(uTint, vec3(0.0)), vec3(power)); }

/** How far in a pixel lies: 0 on the outline, 1 from \`within\` cells inside, or at the area's deepest point where it is narrower. */
float inward(float d, float within) { return smoothstep(0.0, min(within, uDepth), d); }

/**
 * One spark to each square of \`gap\` cells, alive for a part of its own cycle of \`pace\` to
 * \`pace + span\` whole cycles a loop and born in a new place each time: xy the way to it in cells,
 * z how far through its cycle it is, w its own number. \`gap\` divides TILE, so a drift may wrap.
 */
vec4 spark(vec2 q, float gap, float pace, float span) {
  vec2 g = q / gap;
  vec2 i = floor(g);
  vec2 site = mod(i, TILE / gap) + uSeed;
  vec4 h = hash42(site + 3.7);
  float k = pace + floor(h.x * span);
  float turn = uTime * (k / LOOP) + h.y;
  // Counted within its own pace, so the clock's wrap starts it where it was.
  float born = mod(floor(turn), k);
  vec2 at = 0.22 + 0.56 * hash22(site + born * vec2(0.37, 0.71));
  return vec4((g - i - at) * gap, fract(turn), h.z);
}
`;
