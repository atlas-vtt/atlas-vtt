/**
 * Fire: many small flames rooted all over the area's floor, each standing up the screen from its
 * own place, breathing and licking, over a bed that glows wherever the area reaches. So the fire
 * has the area's shape, a line of it is one wall of flame, and a large area has more flames, not
 * larger ones. Its colour runs from the deepened tint at a flame's edge through the tint itself
 * to a bright heart, so fire in green is green fire; its pigment stays thin and its light does the
 * shining, so the map reads through its brightest part.
 */
export const FIRE_GLSL = `
/** Squares of the lattice flames are rooted on, in cells: one flame to each. */
const float FLAME_GAP = 0.44;

/** Embers: sparks carried up, each glowing for a part of its life. */
float embers(vec2 p, float px) {
  vec4 s = spark(p - uDriftB.zw, 0.4, 1100.0, 900.0);
  if (s.w > 0.45) return 0.0;
  float life = smoothstep(0.0, 0.08, s.z) * (1.0 - smoothstep(0.3, 0.75, s.z));
  float size = 0.03 + 0.025 * s.w;
  return life * (1.0 - smoothstep(size * 0.35, size, length(s.xy))) * shown(0.1, px);
}

/** How hot the flames at this pixel are: the hottest of those rooted in its square and around it. */
float flames(vec2 p) {
  vec2 home = floor(p / FLAME_GAP);
  float heat = 0.0;
  // A flame stands up the screen from its root: those of this row and of the two below reach here.
  for (int y = 0; y <= 2; y++) {
    for (int x = -2; x <= 1; x++) {
      vec2 id = home + vec2(float(x), float(y));
      vec4 h = hash42(id + uSeed + 61.0);
      // Every other row stands half a square aside, so no flame stands right over another.
      vec2 root = (id + vec2(h.x + 0.5 * mod(id.y, 2.0), 0.3 + 0.4 * h.y)) * FLAME_GAP;
      // It breathes taller and shorter in its own time; every pulse completes whole cycles a loop.
      float breath = sin(TAU * (cycles(2600.0 + floor(h.z * 2400.0)) + h.w));
      float height = FLAME_GAP * (1.15 + 0.85 * h.z) * (0.8 + 0.2 * breath);
      float t = (root.y - p.y) / height;
      if (t < -0.1 || t > 1.0) continue;
      // Licks travel up it and bend its tip.
      float lick = sin(TAU * (t * 1.2 - cycles(3300.0 + floor(h.w * 1500.0)) + h.x));
      if (uDetail > 0.5) lick = lick * 0.65 + 0.35 * sin(TAU * (t * 2.7 - cycles(6100.0 + floor(h.y * 2000.0)) + h.z));
      float lean = lick * 0.3 * FLAME_GAP * max(t, 0.0);
      // Round and broad at its foot, where it runs into its neighbours, and drawn to a point.
      float girth = FLAME_GAP * (0.5 + 0.22 * h.w) * pow(1.0 - t, 0.9) * sqrt(clamp((t + 0.1) / 0.32, 0.0, 1.0));
      float off = abs(p.x - root.x - lean) / max(girth, 1e-4);
      heat = max(heat, (1.0 - smoothstep(0.2, 1.0, off)) * (1.0 - 0.6 * max(t, 0.0)));
    }
  }
  return heat;
}

vec4 fire(vec2 p, float d, float px) {
  float heart = inward(d, 1.1);
  // A narrow area keeps more of its width for its flames.
  float within = smoothstep(0.0, min(0.28, uDepth * 0.5), d);
  // The bed: the floor glows all over the area, shimmering upward.
  float shimmer = 0.5 + gnoise((p - uDriftA.xy) * vec2(2.0, 1.0), TILE * vec2(2.0, 1.0));
  float bed = within * (0.45 + 0.3 * shimmer + 0.25 * heart);
  float flame = flames(p) * within * (0.72 + 0.28 * heart) * shown(0.2, px);
  // A narrow area (a wall of fire) burns along its whole middle, and its flames stand on that.
  float wall = (1.0 - smoothstep(0.5, 1.1, uDepth)) * smoothstep(0.3, 0.85, heart + (shimmer - 0.5) * 0.6);
  flame = max(flame, wall * (0.5 + 0.2 * shimmer));

  vec3 ember = deepened(2.0) * 0.8;
  vec3 hot = mix(deepened(0.45), vec3(1.0), 0.3);
  vec3 colour = mix(mix(ember, uTint, 0.45), uTint, smoothstep(0.05, 0.45, flame));
  colour = mix(colour, hot, smoothstep(0.5, 0.95, flame));
  // Thin pigment, so the map shows through the brightest flame; the shining is light.
  float alpha = bed * 0.1 + 0.34 * smoothstep(0.0, 0.6, flame);
  float glow = bed * 0.06 + 0.36 * flame * flame;
  vec4 lit = vec4(colour * (alpha + glow), alpha);

  float sparks = uDetail > 0.5 ? embers(p, px) * within : 0.0;
  lit += vec4(hot * sparks, sparks * 0.6);
  return lit;
}
`;
