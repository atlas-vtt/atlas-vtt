/**
 * Fire: a burning area seen from above. One field of heat, made of flow noise (its gradients turn
 * with the clock, so the fire changes where it burns instead of sliding past) carried by a slow
 * turbulence: broad patches that burn harder and weaker, tongues drawn out of them as bright
 * ridges, and a front that crawls along the ragged line where the fire ends inside the outline.
 * Heat is colour: char and the tint deepened where it is low, the tint itself, then its bright
 * hue and near white in the cores, so fire in green is green fire. Low heat is pigment that
 * darkens a bright map (scorched floor, on which the flames show), high heat shines; the floor
 * reads through the gaps between the flames.
 */
export const FIRE_GLSL = `
/**
 * The turns of the fire's two sets of gradients, (cos, sin) of each: one set turns \`one\` times a
 * loop one way, the other \`other\` times the other way, so the fire never returns to a shape in step.
 */
vec4 fireTurns(float one, float other) {
  float a = TAU * cycles(one);
  float b = -TAU * cycles(other);
  return vec4(cos(a), sin(a), cos(b), sin(b));
}

/** Both turns at twice their angle. */
vec4 fireDoubled(vec4 t) {
  return vec4(t.x * t.x - t.y * t.y, 2.0 * t.x * t.y, t.z * t.z - t.w * t.w, 2.0 * t.z * t.w);
}

float fireCorner(vec2 cell, vec2 f, vec4 turns) {
  vec2 g = hash22(cell) * 2.0 - 1.0;
  vec2 t = g.x * g.y > 0.0 ? turns.xy : turns.zw;
  return dot(vec2(g.x * t.x - g.y * t.y, g.x * t.y + g.y * t.x), f);
}

/** Flow noise (Perlin and Neyret), as the water's: gradient noise whose gradients turn with the clock. About 0, within ±0.7. */
float fireNoise(vec2 p, vec2 period, vec4 turns) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, period) + uSeed;
  vec2 i1 = mod(i + 1.0, period) + uSeed;
  float a = fireCorner(i0, f, turns);
  float b = fireCorner(vec2(i1.x, i0.y), f - vec2(1.0, 0.0), turns);
  float c = fireCorner(vec2(i0.x, i1.y), f - vec2(0.0, 1.0), turns);
  float d = fireCorner(i1, f - vec2(1.0, 1.0), turns);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Up to three octaves of it, each finer one turning twice as fast; octaves finer than the screen shows fade out. */
float fireFbm(vec2 p, vec2 period, int octaves, float px, vec4 turns) {
  float sum = 0.0;
  float amp = 0.5;
  for (int o = 0; o < 3; o++) {
    if (o >= octaves) break;
    sum += amp * shown(1.0, px) * fireNoise(p, period, turns);
    p = p * 2.0 + vec2(13.0, 7.0);
    period *= 2.0;
    px *= 2.0;
    turns = fireDoubled(turns);
    amp *= 0.5;
  }
  return sum;
}

/** Embers: sparks carried off, each glowing for a part of its life. */
float embers(vec2 p, float px) {
  vec4 s = spark(p - uDriftB.zw, 0.4, 1100.0, 900.0);
  if (s.w > 0.4) return 0.0;
  float life = smoothstep(0.0, 0.08, s.z) * (1.0 - smoothstep(0.3, 0.75, s.z));
  float size = 0.022 + 0.02 * s.w;
  return life * (1.0 - smoothstep(size * 0.3, size, length(s.xy))) * shown(0.08, px);
}

vec4 fire(vec2 p, float d, float px) {
  int octaves = uDetail > 1.5 ? 3 : 2;
  // Patches hold their place for seconds; every finer octave turns twice as fast, and the tongues flicker.
  vec4 slow = fireTurns(260.0, 180.0);
  vec4 steady = fireTurns(700.0, 500.0);
  vec4 quick = fireDoubled(fireDoubled(steady));
  // The turbulence that carries the fire: it bends every tongue and moves the patches about.
  vec2 a = (p - uDriftB.xy) * 0.75;
  vec2 bend = vec2(fireNoise(a, vec2(TILE * 0.75), slow), fireNoise(a + 19.7, vec2(TILE * 0.75), slow));
  vec2 q = p + bend * 0.7;
  // Where it burns hard and where it only smoulders.
  // (A drift taken at a part of its speed wraps by that part of TILE, so the lattice repeats by as much.)
  float body = fireFbm((q - uDriftA.xy * 0.25) * 1.25, vec2(TILE * 0.25 * 1.25), octaves, px * 1.25, steady);
  // Tongues: sheets of flame seen from above, bright along their ridges.
  vec2 l = (q - uDriftA.xy * 0.5) * 2.5 + body * 0.9;
  float lick = fireNoise(l, vec2(TILE * 0.5 * 2.5), quick);
  // Finer ones break the long ones up.
  if (uDetail > 1.5) lick += 0.3 * shown(0.2, px) * fireNoise(l * 2.0 + 5.3, vec2(TILE * 0.5 * 5.0), fireDoubled(quick));
  float ridge = max(1.0 - abs(lick) * 2.6, 0.0);
  ridge = ridge * ridge * shown(0.4, px);

  // Towards the outline the fire dies down, sooner where it burns low: its end is ragged, never the outline's line.
  float rim = min(0.5, uDepth * 0.85);
  float edge = smoothstep(0.0, rim, d + (body * 1.1 + lick * 0.4) * rim);
  float heart = inward(d, 1.4);
  // Flames stand where the field is high: their middles burn hottest and their rims fray into tongues.
  // Along the outline they crowd into a ring; the middle of a wide area burns in patches.
  // A narrow area (a wall of fire) burns along its whole length.
  float narrow = 1.0 - smoothstep(0.45, 1.1, uDepth);
  float level = body * 1.7 + ridge * (0.1 + 0.2 * narrow) + 0.36 - 0.22 * heart + 0.26 * narrow;
  float flame = smoothstep(-0.1, 0.7, level);
  // Between its ridges a flame stops short of white, so its hottest part keeps its tongues.
  float heat = flame * (0.2 + 0.8 * edge) * edge * (0.74 + 0.26 * ridge) * (1.0 - 0.2 * narrow * (1.0 - ridge));

  vec3 charred = deepened(2.4) * 0.16;
  vec3 red = deepened(2.0) * 0.8;
  vec3 bright = mix(deepened(0.45), vec3(1.0), 0.22);
  vec3 white = mix(deepened(0.3), vec3(1.0), 0.72);
  // A flame's rim is dark and red, which is what shows it on a bright floor; then the colour itself, its bright hue, near white.
  vec3 colour = mix(mix(charred, red, 0.6), red, smoothstep(0.0, 0.2, heat));
  colour = mix(colour, uTint, smoothstep(0.16, 0.44, heat));
  colour = mix(colour, bright, smoothstep(0.44, 0.76, heat));
  colour = mix(colour, white, smoothstep(0.8, 1.0, heat));
  float flames = smoothstep(0.0, 0.34, heat) * (0.72 + 0.2 * smoothstep(0.4, 0.85, heat));

  // Under the flames the floor glows all over the area, more near a flame, and is scorched where nothing burns.
  float within = inward(d, 0.3);
  float close = smoothstep(-0.75, 0.15, level);
  vec3 ember = mix(red, uTint, 0.55);
  float bed = within * (0.08 + 0.2 * close);
  float soot = within * clamp(0.4 - body * 1.6, 0.0, 1.0) * 0.26;
  vec4 under = vec4(ember * bed * (1.0 - soot) + charred * soot, bed + soot * (1.0 - bed));
  // The brink: along the outline the floor smoulders, a glowing line that comes and goes with the fire behind it.
  float smoulder = smoothstep(-0.25, 0.3, body + lick * 0.5);
  float brink = smoothstep(0.0, 0.045, d) * (1.0 - smoothstep(0.05, 0.1 + 0.1 * smoulder, d)) * (0.15 + 0.85 * smoulder);
  under = under * (1.0 - brink * 0.6) + vec4(mix(red, uTint, smoulder) * brink * 0.6, brink * 0.6);
  // What burns brightest shines beyond its pigment, and the bed and the brink glow a little on a dark floor.
  vec4 lit = under * (1.0 - flames) + vec4(colour * flames, flames);
  lit.rgb += colour * 0.3 * heat * heat + ember * (bed * 0.3 + brink * 0.35 * (1.0 - flames));

  float sparks = uDetail > 0.5 ? embers(p, px) * smoothstep(0.0, 0.1, d) : 0.0;
  lit += vec4(bright * sparks, sparks * 0.7);
  return lit;
}
`;
