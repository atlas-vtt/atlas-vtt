/**
 * Water in the map's own illustration, alive at play zoom. Its noise is flow noise: its lattice
 * gradients turn with the clock, so the water changes where it lies instead of sliding like a
 * scrolled texture. A flowing surface carries its ripples downstream in two phases half a cycle apart
 * (Vlachos' flow crossfade), slower towards its banks. From that one field it draws slow reflections
 * and broken strokes of light, and from the shore's distance lines that lap in towards the bank;
 * still water gets drip rings, high detail rare glints. Painted looks draw them in their pale water
 * pigment, engraved looks as ink contours and paper breaks in the hatch. All of it is pigment
 * (premultiplied colour never above alpha), so the art beneath stays. High/balanced/saver: 3/2/1
 * octaves of the body, rings from balanced, glints at high, the banks' drag from balanced. No
 * texture samples beyond the shore's field.
 */
export const WATER_GLSL = `
// An antialiased ribbon, its width in the units of \`distance\`. Never sharpen a subpixel line into shimmer.
float waterRibbon(float distance, float width, float px) {
  return (1.0 - smoothstep(max(0.0, width - px), width + px, abs(distance)))
    * min(1.0, width / max(px, 0.0001));
}

/**
 * The turns of the noise's two sets of gradients, (cos, sin) of each: one set turns 112 times a loop
 * one way, the other 77 times the other, so the water never returns to a shape in step. Worked out
 * once a pixel; every finer octave turns twice as fast, by the double angle, without trigonometry.
 */
vec4 waterTurns() {
  float a = TAU * cycles(112.0);
  float b = -TAU * cycles(77.0);
  return vec4(cos(a), sin(a), cos(b), sin(b));
}

vec4 waterDoubled(vec4 t) {
  return vec4(t.x * t.x - t.y * t.y, 2.0 * t.x * t.y, t.z * t.z - t.w * t.w, 2.0 * t.z * t.w);
}

// A corner's gradient, turned by its set's turn; the gradient's quadrant picks the set.
float waterCorner(vec2 cell, vec2 f, vec4 turns) {
  vec2 g = hash22(cell) * 2.0 - 1.0;
  vec2 t = g.x * g.y > 0.0 ? turns.xy : turns.zw;
  return dot(vec2(g.x * t.x - g.y * t.y, g.x * t.y + g.y * t.x), f);
}

/**
 * Flow noise (Perlin & Neyret): gradient noise whose gradients turn with the clock, so the water
 * changes where it lies instead of sliding like a scrolled texture. Noise is linear in its
 * gradients, so turning them by two shared angles costs four multiplications a corner.
 */
float waterNoise(vec2 p, vec2 period, vec4 turns) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i, period) + uSeed;
  vec2 i1 = mod(i + 1.0, period) + uSeed;
  float a = waterCorner(i0, f, turns);
  float b = waterCorner(vec2(i1.x, i0.y), f - vec2(1.0, 0.0), turns);
  float c = waterCorner(vec2(i0.x, i1.y), f - vec2(0.0, 1.0), turns);
  float d = waterCorner(i1, f - vec2(1.0, 1.0), turns);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

/** Up to three octaves of it, each finer one turning twice as fast, scaled so every detail tier spans the same range. */
float waterFbm(vec2 p, vec2 period, int octaves, float px, vec4 turns) {
  float sum = 0.0;
  float total = 0.0;
  float amp = 0.5;
  for (int o = 0; o < 3; o++) {
    if (o >= octaves) break;
    sum += amp * shown(1.0, px) * waterNoise(p, period, turns);
    total += amp;
    p = p * 2.0 + vec2(13.0, 7.0);
    period *= 2.0;
    px *= 2.0;
    turns = waterDoubled(turns);
    amp *= 0.5;
  }
  return sum / total * 0.5;
}

// Scales of the two layers, in cells; each a multiple of 1/64, so the lattice repeats every TILE cells.
const vec2 WATER_BODY_STILL = vec2(0.5, 0.5);
const vec2 WATER_BODY_FLOWING = vec2(0.75, 0.3125);
const vec2 WATER_LINES_STILL = vec2(0.875, 1.75);
const vec2 WATER_LINES_FLOWING = vec2(1.25, 0.5);

/** Cells per second the current runs at this distance from the bank: slower where it drags on the shore. */
float waterCurrent(float d) {
  return 0.32 * (0.35 + 0.65 * smoothstep(0.0, 1.4, d));
}

/**
 * The broad body (x) and the ripple field it warps (y), as the surface shows them now. Still water
 * reads them where they lie. On a flowing surface the body drifts downstream as one (it is too broad
 * to show the banks' drag) and the ripple field, which shows the current, is read at two phases 4 s
 * apart, each carried downstream at the speed where it lies and faded out as it would jump back, so
 * the current never shears it (Portal 2's flow, Catlike Coding's jump offsets). Their blend is
 * scaled back to one noise's spread, or the lines would thicken between phases.
 */
vec2 waterField(vec2 q, float d, float px, int octaves) {
  vec4 turns = waterTurns();
  vec4 lineTurns = waterDoubled(turns);
  bool flowing = uFlowing > 0.5;
  vec2 bodyScale = flowing ? WATER_BODY_FLOWING : WATER_BODY_STILL;
  vec2 lineScale = flowing ? WATER_LINES_FLOWING : WATER_LINES_STILL;
  float body = waterFbm((q - uDriftA.xy) * bodyScale, TILE * bodyScale, octaves, px * bodyScale.x, turns);
  // Saver carries a flowing surface's ripples at one speed: half the work, no drag at the banks.
  vec2 drift = !flowing ? uDriftA.xy : uDriftA.zw;
  if (!flowing || uDetail < 0.5) return vec2(body, waterNoise((q - drift) * lineScale + body * 1.6, TILE * lineScale, lineTurns));
  float travel = 4.0 * waterCurrent(d);
  float phase = cycles(1024.0);
  float restarts = floor(uTime * (1024.0 / LOOP));
  float lines = 0.0;
  float spread = 0.0;
  for (int k = 0; k < 2; k++) {
    float p = fract(phase + float(k) * 0.5);
    float restart = mod(restarts + (p < phase ? 1.0 : 0.0) + float(k) * 7.0, 64.0);
    vec2 at = q - vec2(0.0, (p - 0.5) * travel) + vec2(0.31, 0.23) * restart;
    float weight = 1.0 - abs(1.0 - 2.0 * p);
    lines += weight * waterNoise(at * lineScale + body * 1.6, TILE * lineScale, lineTurns);
    spread += weight * weight;
  }
  return vec2(body, lines * inversesqrt(spread));
}

/**
 * Short lines along the shore that lap in towards it, two at a time, wavering with the ripples and
 * broken into dashes. They keep within 0.3 cells of the bank: farther in, a narrow channel's
 * middle would gather them into one line along it, and straight banks would frame the water.
 */
float waterLap(float d, float body, float wave, float width, float px) {
  float lap = 0.0;
  for (int k = 0; k < 2; k++) {
    float t = fract(cycles(560.0) + float(k) * 0.5);
    float at = 0.04 + (1.0 - t) * 0.26 + wave * 0.08 + body * 0.05;
    float life = smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.65, 1.0, t));
    lap += waterRibbon(d - at, width * (0.6 + 0.6 * (1.0 - t)), px) * life;
  }
  // Dashes where the ripple field passes its levels, riding the current, so a straight bank never gets a frame.
  float dashes = sin(TAU * (wave * 1.6 + body * 2.3));
  return lap * smoothstep(-0.45, 0.35, dashes) * smoothstep(-0.12, 0.08, body);
}

/** Rings spreading from a drip, one place at most in a square of three cells, quiet between drips. */
float waterRings(vec2 cells, float d, float wave, float width, float px) {
  vec2 lattice = floor(cells / 3.0);
  vec4 h = hash42(lattice + uSeed + 17.0);
  if (h.z > 0.6) return 0.0;
  vec2 centre = lattice * 3.0 + 1.05 + hash22(lattice + uSeed + 41.0) * 0.9;
  float age = fract(cycles(floor(380.0 + h.w * 300.0)) + h.x) / 0.65;
  if (age >= 1.0) return 0.0;
  float r = length(cells - centre);
  float radius = 0.06 + age * 0.9;
  float ring = waterRibbon(r - radius, width * (1.0 + age), px)
    + 0.6 * waterRibbon(r - radius * 0.6, width, px) * smoothstep(0.08, 0.2, radius * 0.6);
  // Broken where the ripples run against it, so a ring is drawn in arcs, never a compass circle.
  float arcs = smoothstep(-0.2, 0.05, wave + 0.1);
  return ring * arcs * (1.0 - age) * (1.0 - age) * smoothstep(0.0, 0.06, age) * smoothstep(0.12, 0.4, d);
}

/** Rare small glints on the crests, each flashing briefly at its own pace; flowing water carries them along. */
float waterGlints(vec2 q, float crest, float px) {
  vec2 g = (q - uDriftB.xy) * 1.5;
  vec2 i = floor(g);
  vec4 h = hash42(mod(i, TILE * 1.5) + uSeed + 31.0);
  vec2 offset = (g - i - 0.2 - 0.6 * h.xy) / 1.5;
  float dist = length(offset * vec2(1.0, 1.8));
  float flash = fract(cycles(floor(140.0 + h.z * 220.0)) + h.w) / 0.2;
  float life = flash < 1.0 ? sin(3.14159265 * flash) : 0.0;
  return (1.0 - smoothstep(0.025, 0.06 + px, dist)) * life * smoothstep(0.05, 0.25, crest);
}

vec4 water(vec2 q, float d, float px, float near) {
  int octaves = uDetail > 1.5 ? 3 : uDetail > 0.5 ? 2 : 1;
  vec2 field = waterField(q, d, px, octaves);
  float body = field.x;
  float wave = field.y;
  float depth = smoothstep(0.08, 1.6, d);
  // Ripple lines where the warped field crosses zero, as thin as two screen pixels allow.
  float lineWidth = uEngraved > 0.5 ? 0.08 : 0.035 + 0.025 * depth;
  // Broken where the body passes its levels, so they read as strokes of light, never as contour worms.
  float strokes = smoothstep(-0.1, 0.6, sin(TAU * body * 3.2 + 1.0));
  float ripple = waterRibbon(wave, lineWidth, max(fwidth(wave), 1e-4)) * strokes * shown(0.3, px);
  float lap = waterLap(d, body, wave, uEngraved > 0.5 ? 0.012 : 0.018, px) * shown(0.08, px);
  float rings = 0.0;
  if (uDetail > 0.5 && uFlowing < 0.5) rings = waterRings(vWorld / uCell, d, wave, uEngraved > 0.5 ? 0.011 : 0.014, px) * shown(0.1, px);
  float glint = uDetail > 1.5 ? waterGlints(q, body, px) * mix(0.4, 1.0, near) : 0.0;

  if (uEngraved > 0.5) {
    // Level burin strokes like the static hatch, whatever way the water flows; the moving body decides which show.
    vec2 mapCell = vWorld / uCell;
    float phase = mapCell.y * 4.0 + body * 0.3;
    float lineDistance = (fract(phase + 0.5) - 0.5) / 4.0;
    float envelope = smoothstep(0.02, 0.2, body);
    float stroke = waterRibbon(lineDistance, (0.006 + 0.008 * depth) * envelope, px) * envelope;
    // Light breaking the hatch: short level dashes of paper where the ripple lines cross it.
    float open = waterRibbon(lineDistance, 0.04, px) * ripple * smoothstep(-0.12, 0.1, -body) * 0.92;
    float ink = max(max(stroke * 0.55, lap * 0.9), rings * 0.85) * shown(0.08, px);
    float paper = max(open, glint) * (1.0 - ink);
    return vec4(uDeep * ink + uGlint * paper, ink + paper);
  }

  // Slow reflections over the broad body and darker troughs between them, then the lines.
  float sheen = smoothstep(0.04, 0.34, body + wave * 0.1);
  float shade = 0.03 + depth * 0.07 + smoothstep(0.0, 0.3, -body) * 0.07;
  float rippleLight = ripple * mix(0.4, 0.26, depth) * smoothstep(-0.1, 0.12, body);
  float light = 1.0 - (1.0 - sheen * 0.2) * (1.0 - rippleLight) * (1.0 - lap * 0.42) * (1.0 - rings * 0.45) * (1.0 - glint * 0.75);
  // Ordinary source-over pigment: colour never exceeds alpha, including monochrome.
  return vec4(uDeep * shade * (1.0 - light) + uGlint * light, shade * (1.0 - light) + light);
}
`;
