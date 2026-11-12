/**
 * Frost: rime lying on the floor as six-armed crystals, large and crowded along the outline and
 * small and few inside, over a thin sheet of ice. A slow breath moves where the frost lies thick,
 * so crystals grow and melt back as it passes, and glints come and go. The sheet is the area's
 * colour, its crystals nearly white, so it shows on dark and bright maps.
 */
export const FROST_GLSL = `
/** A glint: a small four-pointed star that swells and goes. */
float glint(vec2 p, float px) {
  vec4 s = spark(p, 0.8, 900.0, 1100.0);
  if (s.w > 0.6) return 0.0;
  float life = smoothstep(0.0, 0.12, s.z) * (1.0 - smoothstep(0.16, 0.42, s.z));
  float reach = (0.07 + 0.07 * s.w) * (0.5 + 0.5 * life);
  vec2 a = abs(s.xy);
  float arms = max(0.0, 1.0 - a.x / reach) * max(0.0, 1.0 - a.y / (reach * 0.14 + px));
  arms += max(0.0, 1.0 - a.y / reach) * max(0.0, 1.0 - a.x / (reach * 0.14 + px));
  float heart = 1.0 - smoothstep(0.0, reach * 0.3 + px, length(s.xy));
  return life * min(1.0, arms * arms + heart) * shown(0.07, px);
}

/**
 * The crystal nearest to p on a lattice of \`gap\` cells (which divides TILE): xy the way from its
 * middle in cells, z its own number, w how far the pixel lies inside its ground.
 */
vec4 nearestCrystal(vec2 p, float gap) {
  vec2 g = p / gap;
  vec2 i = floor(g);
  vec2 f = g - i;
  float best = 8.0;
  float second = 8.0;
  vec2 to = vec2(0.0);
  float id = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec4 h = hash42(mod(i + cell, TILE / gap) + uSeed + gap * 17.0);
      vec2 r = cell + 0.2 + 0.6 * h.xy - f;
      float dist = dot(r, r);
      if (dist < best) { second = best; best = dist; to = r; id = h.z; }
      else if (dist < second) { second = dist; }
    }
  }
  return vec4(-to * gap, id, (sqrt(second) - sqrt(best)) * 0.5 * gap);
}

/** A six-armed crystal with barbs: how much ice lies at \`v\` from its middle, its arms \`size\` long and turned by \`turned\`. */
float crystalArms(vec2 v, float size, float turned, float px) {
  float sector = TAU / 6.0;
  float turn = (atan(v.y, v.x) + turned) / sector;
  float a = (fract(turn) - 0.5) * sector;
  // No two arms of a crystal are as long: each of the six has its own share of the size.
  size *= 0.62 + 0.38 * hash11(mod(floor(turn), 6.0) + turned * 5.7);
  // Along the nearest arm and off it.
  vec2 q = length(v) * vec2(cos(a), abs(sin(a)));
  float width = 0.008 + px * 0.75;
  float arm = (1.0 - smoothstep(width * 0.5, width * 1.6, q.y)) * (1.0 - smoothstep(size * 0.8, size, q.x));
  // Barbs leave the arm at a sixth of a turn, shorter towards its tip.
  float gap = size * 0.25;
  float k = clamp(floor(q.x / gap + 0.5), 1.0, 3.0);
  vec2 b = q - vec2(k * gap, 0.0);
  float along = b.x * 0.5 + b.y * 0.866;
  float reach = size * (0.44 - 0.1 * k);
  float barb = (1.0 - smoothstep(width * 0.4, width * 1.4, abs(b.x * 0.866 - b.y * 0.5))) * step(0.0, along) * (1.0 - smoothstep(reach * 0.75, reach, along));
  return max(arm, barb * 0.85);
}

/** The crystals of one lattice where the frost lies \`thick\`: each grows once the frost is thicker than its own need. */
float crystals(vec2 p, float gap, float thick, float px) {
  vec4 c = nearestCrystal(p, gap);
  float grown = smoothstep(c.z * 0.75, c.z * 0.75 + 0.35, thick);
  if (grown <= 0.0) return 0.0;
  // Much of a size, as crystals grown on one floor are.
  float size = gap * (0.36 + 0.12 * fract(c.z * 7.3)) * (0.7 + 0.3 * grown);
  return crystalArms(c.xy, size, c.z * 31.0, px) * grown * smoothstep(0.0, 0.05 * gap, c.w) * shown(gap * 0.12, px);
}

vec4 frost(vec2 p, float d, float px) {
  float rime = 1.0 - inward(d, 1.1);
  float within = inward(d, 0.18);
  int octaves = uDetail > 1.5 ? 3 : 2;
  float breath = fbm((p - uDriftA.xy) * 1.25, vec2(TILE * 1.25), octaves, px * 1.25);
  // How thickly the frost lies: along the outline always, inside in patches that slowly move.
  float thick = clamp(0.28 + 0.6 * rime + breath * 1.3, 0.0, 1.0);
  // The large crystals are the fewer: they need thicker frost than the small ones between them.
  float ice = crystals(p, 0.8, thick * 0.8, px) * 0.85;
  if (uDetail > 0.5) ice = max(ice, crystals(p + 3.3, 0.4, thick, px) * 0.75);
  // Hoar: the fine white bloom all over the rime, heavier where the frost is thick.
  float hoar = (0.35 + 0.65 * thick) * (0.5 + gnoise(p * 6.0, vec2(TILE * 6.0)) * shown(0.17, px));

  // An even rime over the whole area, in the colour deepened, so it shows on parchment too.
  float sheet = within * (0.25 + 0.1 * thick);
  float white = within * clamp(ice * 0.85 + hoar * 0.26, 0.0, 1.0);
  vec3 colour = mix(mix(uTint, deepened(1.8), 0.6), lifted(0.92), white);
  float alpha = min(sheet + white * 0.45, 0.75);
  vec4 lit = vec4(colour * (alpha + white * 0.18), alpha);

  float star = uDetail > 0.5 ? glint(p, px) * within : 0.0;
  lit += vec4(vec3(1.0) * star * 0.9, star * 0.5);
  return lit;
}
`;
