/**
 * Frost: ice taking the floor from the outline inwards. The floor is glazed in grains, plates of
 * ice each of its own tone with a seam between them, and on every grain lies a feather of fern
 * frost: a spine with barbs leaving it at a sixth of a turn, as rime grows on a pane. The frost
 * lies thick along the outline, where the feathers are whole and a white bloom covers the glaze,
 * and thins inwards to spines and bare ice, in tongues that a slow breath moves, so the map reads
 * through the middle. Light passes slowly over the grains, glints come and go, and a low mist
 * drifts over it all. The glaze is the area's colour deepened, the frost nearly white, so the frost
 * shows on its own ice on a bright map as on a dark one.
 */
export const FROST_GLSL = `
/** A glint: a small four-pointed star that swells and goes. */
float glint(vec2 p, float px) {
  vec4 s = spark(p, 0.8, 900.0, 1100.0);
  if (s.w > 0.5) return 0.0;
  float life = smoothstep(0.0, 0.12, s.z) * (1.0 - smoothstep(0.16, 0.42, s.z));
  float reach = (0.05 + 0.05 * s.w) * (0.5 + 0.5 * life);
  vec2 a = abs(s.xy);
  float arms = max(0.0, 1.0 - a.x / reach) * max(0.0, 1.0 - a.y / (reach * 0.12 + px));
  arms += max(0.0, 1.0 - a.y / reach) * max(0.0, 1.0 - a.x / (reach * 0.12 + px));
  float heart = 1.0 - smoothstep(0.0, reach * 0.25 + px, length(s.xy));
  return life * min(1.0, arms * arms + heart) * shown(0.05, px);
}

/**
 * Needles of ice lying along \`dir\`: long thin streaks, each tapering at its ends, about 0 (within
 * ±0.7), \`across\` of them to a cell's width. They lie still, so their lattice need not repeat
 * with the drifts.
 */
float frostNeedles(vec2 p, vec2 dir, float across, float salt, float px) {
  vec2 q = vec2(dot(p, dir) * across * 0.07, (p.x * dir.y - p.y * dir.x) * across);
  // Needles lie unevenly close: evenly spaced, two ways of them cross as a ladder.
  q.y += 2.4 * lineNoise(q.y * 0.31 + salt) + 0.5 * lineNoise(q.x * 0.9 - salt);
  return gnoise(q + salt, vec2(8192.0)) * shown(1.0 / across, px);
}

/** The needles of the three ways crystals grow, a sixth of a turn apart. */
vec3 frostWays(vec2 p, float across, float salt, float px) {
  float turned = uSeed.x * 0.37 + salt;
  return vec3(
    frostNeedles(p, vec2(cos(turned), sin(turned)), across, salt + 3.0, px),
    frostNeedles(p, vec2(cos(turned + 1.0472), sin(turned + 1.0472)), across, salt + 57.0, px),
    frostNeedles(p, vec2(cos(turned + 2.0944), sin(turned + 2.0944)), across, salt + 113.0, px));
}

/**
 * How much frost the needles of the three ways make where it lies \`thick\`: along the outline
 * they crowd and cross, inside only the tips of the strongest show.
 */
float frostGrown(vec3 needle, vec3 thick, float crowd) {
  vec3 need = mix(vec3(0.5), vec3(crowd), thick);
  vec3 grown = smoothstep(need, need + 0.13, needle);
  return min(1.0, grown.x + grown.y + grown.z);
}

vec4 frost(vec2 p, float d, float px) {
  int octaves = uDetail > 1.5 ? 3 : 2;
  float within = inward(d, 0.14);
  float breath = fbm((p - uDriftA.xy) * 0.75, vec2(TILE * 0.75), octaves, px * 0.75);
  // How thickly the frost lies: along the outline always, inwards in tongues that slowly move.
  float thick = clamp(1.05 - d / min(1.1, uDepth * 1.6) + breath * 1.3, 0.0, 1.0);

  // Each of the three ways has floor of its own where it grows best.
  vec2 m = p * 0.8;
  float a = gnoise(m + 7.0, vec2(8192.0));
  float b = gnoise(m + 41.0, vec2(8192.0));
  vec3 lean = clamp(vec3(0.55 + a * 2.4, 0.55 + b * 2.4, 0.55 - (a + b) * 1.8), 0.0, 1.0);
  // No needle is quite straight and no two patches lie quite alike: the floor they grow on is bent a little.
  vec2 bent = p + vec2(a, b) * 0.36;
  // Long blades, few, that reach in past the rime; and fine needles crowding along the outline.
  // (Where the fine ones are left out, the blades are finer and more, so the rime is still needles.)
  bool rich = uDetail > 0.5;
  vec3 blades = frostWays(bent, rich ? 12.0 : 17.0, 0.0, px) * lean;
  float ice = frostGrown(blades, vec3(min(thick * 1.25, 1.0)), rich ? 0.19 : 0.1);
  float gloss = 0.0;
  if (rich) {
    vec3 fine = frostWays(bent, 22.0, 0.5, px);
    ice = max(ice, 0.85 * frostGrown(fine, thick * (0.35 + 0.65 * lean.yzx), 0.07));
    // The same needles lie under the bare glaze too, and show only where light catches them.
    vec3 lying = fine * (0.25 + 0.75 * lean.yzx);
    gloss = clamp(max(lying.x, max(lying.y, lying.z)) * 2.4, 0.0, 1.0);
  }
  // Under the needles of the thickest frost a white haze, so the outline's band is rime all through.
  // Its inner edge is the blades' own: where one lies, the rime reaches further in.
  float spiked = thick + max(blades.x, max(blades.y, blades.z)) * 0.9;
  float crust = smoothstep(0.72, 0.95, spiked) * 0.36;
  // Light passing slowly over the ice in broad bands, which the lie of the frost bends.
  float band = 0.5 + 0.5 * sin(TAU * (dot(p, vec2(0.23, 0.14)) + breath * 0.8 + a * 0.5 - cycles(410.0)));
  float sheen = band * band * band * band;

  // The glaze under the frost: the colour deepened, deeper where the frost is thick.
  vec3 glaze = mix(deepened(1.8), deepened(3.0) * 0.66, thick);
  float sheet = within * (0.18 + 0.48 * thick);
  float white = within * clamp(ice * 0.92 + crust * (1.0 - ice) + gloss * (0.06 + 0.4 * sheen) + sheen * 0.07, 0.0, 1.0);
  vec3 colour = mix(glaze, lifted(0.94), white);
  float alpha = sheet + white * (0.9 - sheet);
  vec4 lit = vec4(colour * (alpha + white * 0.12), alpha);

  // A low mist drifting over it, in the colour lifted.
  float veil = fbm((p - uDriftA.zw * 4.0) * 0.5 + 9.0, vec2(TILE * 0.5), 2, px * 0.5);
  float haze = within * smoothstep(0.0, 0.45, veil + 0.12) * 0.16;
  lit = lit * (1.0 - haze) + vec4(lifted(0.8) * haze, haze);

  float star = uDetail > 0.5 ? glint(p, px) * within : 0.0;
  lit += vec4(vec3(1.0) * star * 0.9, star * 0.5);
  return lit;
}
`;
