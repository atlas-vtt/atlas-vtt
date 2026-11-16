/**
 * Liquids in Crayon's hand: short bowed crayon strokes that each live a life of their own, fading in
 * where the hand lays them, gliding with the liquid, fading out and coming back elsewhere, every one
 * on its own clock, so the surface is always changing a little and never all at once. (A boil, every
 * stroke redrawn together a few times a second, read as a stutter: a jump of ten times the motion
 * between frames.) Which strokes show is decided by the same moving fields the painted liquids use,
 * and the paper's grain stays where it lies and breaks every stroke, as it breaks the static crayon.
 * Water: pale strokes where light lies on the drifting body, deeper blue in its troughs, graphite
 * ripples, laps at the shore and drip rings. Lava: flame strokes along the hot seams, breathing with
 * its light, ember between, dark crust strokes riding the rafts and pencilled cracks. Acid: green
 * strokes heavier at the bank and pencilled bubbles. Premultiplied pigment, never above alpha, over
 * the map. Must follow the water, lava and acid code, whose fields it reads.
 */
export const CRAYON_GLSL = `
// The static crayon's hatch angle, radians, and its second pass a little turned.
const float CRAYON_ANGLE = -0.66;

/** How much colour the paper's grain keeps at this pixel: still, a map pixel a grain. */
float crayonTooth() {
  return 0.62 + 0.38 * hash22(floor(vWorld) + 0.5).x;
}

/**
 * One pass of crayon strokes over \`p\` (cells, in whatever frame the strokes ride): lines \`gap\`
 * apart at \`angle\`, each broken into strokes about \`len\` long. Every stroke lives \`life\` seconds
 * or so on a clock of its own: it fades in, holds and fades out, and its next life starts, bows and
 * ends where its own hash puts it. Lives are whole cycles of the loop, so the clock wraps unseen.
 * \`slots\` (0 for none) makes a line's strokes repeat after that many, so strokes riding a drift
 * that wraps by \`TILE\` cells along them wrap unseen too.
 */
float crayonStrokes(vec2 p, float angle, float gap, float len, float width, float life, float slots, float px, float salt) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float along = dot(p, dir);
  float across = dot(p, vec2(-dir.y, dir.x));
  float line = floor(across / gap);
  vec4 l = hash42(vec2(line, salt) + uSeed);
  float s = along / len + l.x * 17.0;
  float slot = slots > 0.0 ? mod(floor(s), slots) : floor(s);
  vec4 own = hash42(vec2(slot, line * 1.37 + salt) + uSeed + 5.0);
  float pace = floor(LOOP / (life * (0.7 + 0.6 * own.x)));
  float age = uTime * (pace / LOOP) + own.y;
  float lived = fract(age);
  // The life it is in, counted within the loop, so the clock's wrap starts it where it was.
  float lifeIndex = mod(floor(age), pace);
  vec4 g = hash42(vec2(slot + lifeIndex * 0.618, line * 1.37 + salt) + uSeed + 11.0);
  float t = fract(s);
  float a = 0.04 + g.x * 0.18;
  float b = 0.78 + g.y * 0.2;
  float inStroke = smoothstep(a, a + 0.06, t) * (1.0 - smoothstep(b - 0.06, b, t));
  float bow = (g.z - 0.5) * gap * 0.45 * sin(3.14159265 * clamp((t - a) / (b - a), 0.0, 1.0));
  float centre = (line + 0.5 + (l.y - 0.5) * 0.3) * gap + bow;
  float w = width * (0.75 + 0.25 * g.w);
  float fade = smoothstep(0.0, 0.3, lived) * (1.0 - smoothstep(0.65, 1.0, lived));
  return waterRibbon(across - centre, w * 0.5, px) * inStroke * fade * step(0.15, l.z * 0.7 + g.w * 0.3);
}

/** Lays \`colour\` at coverage \`a\` over premultiplied \`under\`. */
vec4 crayonOver(vec4 under, vec3 colour, float a) {
  return under * (1.0 - a) + vec4(colour * a, a);
}

// A flowing surface's strokes run down its flow, this long, so a line repeats every TILE cells as its drift does.
const float CRAYON_RIDE_LEN = 0.4;

vec4 crayonWater(vec2 q, float d, float px) {
  int octaves = uDetail > 1.5 ? 3 : uDetail > 0.5 ? 2 : 1;
  vec2 field = waterField(q, d, px, octaves);
  float body = field.x;
  float wave = field.y;
  float depth = smoothstep(0.08, 1.6, d);
  float tooth = crayonTooth();
  float light = smoothstep(0.0, 0.14, body + wave * 0.05);
  float trough = smoothstep(0.0, 0.14, -body) * (0.45 + 0.55 * depth);
  float pale;
  float blue;
  if (uFlowing > 0.5) {
    // Carried down the channel with its ripples, exactly along the flow (the frame's y).
    vec2 ride = q - uDriftA.zw;
    float slots = TILE / CRAYON_RIDE_LEN;
    pale = crayonStrokes(ride, 1.5707963, 0.05, CRAYON_RIDE_LEN, 0.034, 2.4, slots, px, 0.0) * light;
    blue = crayonStrokes(ride, 1.5707963, 0.06, CRAYON_RIDE_LEN, 0.032, 3.0, slots, px, 101.0) * trough;
  } else {
    // Still water: the strokes stay on the paper; the swaying body and their own lives move them.
    pale = crayonStrokes(q, CRAYON_ANGLE, 0.05, 0.42, 0.034, 2.4, 0.0, px, 0.0) * light;
    blue = crayonStrokes(q, CRAYON_ANGLE + 0.1, 0.06, 0.36, 0.032, 3.0, 0.0, px, 101.0) * trough;
  }
  // Graphite: the ripple lines where the field crosses zero, at their distance in cells (its value
  // over its slope), the laps and the rings.
  float broken = smoothstep(-0.1, 0.6, sin(TAU * body * 3.2 + 1.0));
  float cellsAway = wave / max(fwidth(wave), 1e-4) * px;
  float ripple = waterRibbon(cellsAway, 0.007, px) * broken * shown(0.3, px);
  float lap = waterLap(d, body, wave, 0.016, px) * shown(0.08, px);
  float rings = uDetail > 0.5 && uFlowing < 0.5 ? waterRings(vWorld / uCell, d, wave, 0.014, px) * shown(0.1, px) : 0.0;
  float ink = max(max(ripple * 0.75, lap * 0.85), rings * 0.8);
  vec4 colour = crayonOver(vec4(0.0), uSurface, blue * 0.6 * tooth);
  colour = crayonOver(colour, uGlint, pale * 0.78 * tooth);
  return crayonOver(colour, uDeep, ink * tooth);
}

vec4 crayonLava(vec2 q, float d, float px) {
  float depth = smoothstep(0.03, 1.1, d);
  int octaves = uDetail > 1.5 ? 2 : 1;
  vec2 w = (q - uDriftA.xy) * 0.5;
  float bend = fbm(w, vec2(TILE * 0.5), octaves, px * 0.5);
  vec2 p = q - uDriftA.zw + vec2(bend, bend * 0.6) * 0.5;
  float heat = 0.5 + fbm((q - uDriftB.xy) * 0.75, vec2(TILE * 0.75), octaves, px * 0.75);
  vec3 plate = voronoiFast(p * 2.5, vec2(TILE * 2.5), 0.0);
  float edge = plate.y / 2.5;
  float hot = (1.0 - smoothstep(0.03, 0.1, edge)) * smoothstep(0.35, 0.7, heat + plate.z * 0.2);
  float crusted = smoothstep(0.06, 0.13, edge) * (1.0 - smoothstep(0.55, 0.8, heat) * depth * 0.6);
  float tooth = crayonTooth();
  // The strokes stay on the paper; the creeping rafts, seams and heat decide which show.
  float ember = crayonStrokes(q, CRAYON_ANGLE + 0.1, 0.055, 0.34, 0.034, 2.6, 0.0, px, 57.0) * (1.0 - crusted * 0.7);
  float crust = crayonStrokes(q, CRAYON_ANGLE + 1.5, 0.065, 0.28, 0.03, 4.0, 0.0, px, 211.0) * crusted;
  float flame = crayonStrokes(q, CRAYON_ANGLE, 0.045, 0.3, 0.036, 1.8, 0.0, px, 0.0) * hot * uLavaGlow;
  float crack = waterRibbon(edge, 0.009, px) * crusted * (1.0 - hot) * shown(0.1, px);
  vec4 colour = crayonOver(vec4(0.0), uSurface, ember * 0.62 * tooth);
  colour = crayonOver(colour, uDeep, crust * 0.5 * tooth);
  colour = crayonOver(colour, uGlint, flame * 0.88 * tooth);
  return crayonOver(colour, uDeep, crack * 0.7 * tooth);
}

vec4 crayonAcid(vec2 q, float d, float px) {
  float current = fbm((q - uDriftA.xy) * 0.75, vec2(TILE * 0.75), int(uDetail) + 1, px * 0.75);
  float bank = 1.0 - smoothstep(0.08, 0.5, d + current * 0.1);
  vec3 bubble = acidBubble(q, d, px);
  float tooth = crayonTooth();
  float stain = crayonStrokes(q, CRAYON_ANGLE, 0.055, 0.36, 0.034, 3.0, 0.0, px, 0.0) * (0.35 + 0.65 * max(bank, smoothstep(0.0, 0.3, current)));
  float swell = crayonStrokes(q, CRAYON_ANGLE + 1.4, 0.05, 0.2, 0.03, 1.6, 0.0, px, 31.0) * bubble.y;
  vec4 colour = crayonOver(vec4(0.0), uSurface, stain * 0.6 * tooth);
  colour = crayonOver(colour, uGlint, swell * 0.7 * tooth);
  return crayonOver(colour, uDeep, bubble.x * 0.8 * tooth);
}
`;
