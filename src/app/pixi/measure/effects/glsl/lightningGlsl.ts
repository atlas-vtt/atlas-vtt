/**
 * Lightning: arcs that strike across the area, jump a few times and go, with smaller crackles
 * between them and the floor dark and faintly charged beneath. Arcs stand on a lattice laid along
 * the area's own length (`uFrame`), so a wall of lightning runs with arcs and a circle is crossed
 * every way. An arc is a white heart in a halo of the area's colour: the halo tints a bright map,
 * the heart lights a dark one.
 */
export const LIGHTNING_GLSL = `
/** How many shapes an arc jumps through while it lasts. */
const float STRIKE_JUMPS = 4.0;

/**
 * The arcs of one lattice of \`gap\` cells at this pixel: x their heart, y their halo. Each lasts
 * \`share\` of its own cycle of \`pace\` to twice \`pace\` whole cycles a loop; \`forked\` ones branch.
 */
vec2 arcs(vec2 p, float px, float gap, float share, float pace, float forked) {
  vec2 axis = uFrame.zw;
  vec2 rel = p - uFrame.xy;
  // Across and along the area, in lattice squares; its middle is a square's middle.
  vec2 g = vec2(dot(rel, vec2(-axis.y, axis.x)), dot(rel, axis)) / gap;
  vec2 home = floor(g + 0.5);
  vec2 lit = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = home + vec2(float(x), float(y));
      vec4 h = hash42(id + uSeed + gap * 211.0);
      float cyclesALoop = pace + floor(h.x * pace);
      float turn = uTime * (cyclesALoop / LOOP) + h.y;
      float phase = fract(turn);
      // Counted within its own pace, so the clock's wrap starts it where it was.
      float strike = mod(floor(turn), cyclesALoop);
      // Held still, some arcs stand as they are a third of the way through.
      if (uStill > 0.5) { phase = h.z < 0.45 ? share * 0.3 : 1.0; strike = 0.0; }
      if (phase >= share) continue;
      float life = phase / share;
      float jump = floor(life * STRIKE_JUMPS);
      vec4 e = hash42(id * 7.31 + strike * vec2(0.731, 0.377) + uSeed);
      // Its own way: any on a round area, along a long one, which also keeps its arcs on its middle line.
      float lean = (e.x - 0.5) * uSpread;
      vec2 way = vec2(cos(lean), sin(lean));
      vec2 at = (g - id - (e.yz - 0.5) * vec2(0.7 * clamp(uSpread / (TAU * 0.5), 0.1, 1.0), 0.7)) * gap;
      float along = dot(at, vec2(way.y, way.x));
      float across = dot(at, vec2(way.x, -way.y));
      float span = gap * (0.75 + 0.5 * e.w);
      float taper = 1.0 - smoothstep(span * 0.5, span, abs(along));
      if (taper <= 0.0) continue;
      // The same broad bends through its life, finer ones anew at every jump.
      float salt = e.w * 91.0 + strike;
      float broad = lineNoise(along * 2.6 / gap + salt) * 0.23 * gap;
      float bend = broad + lineNoise(along * 3.7 + salt + jump * 17.0) * 0.2 + lineNoise(along * 9.0 + salt + jump * 29.0) * 0.07;
      float flare = (0.6 + 0.4 * hash11(jump * 3.1 + salt)) * (1.0 - life * life * life);
      float off = abs(across - bend);
      float width = 0.012 + px * 0.8;
      lit.x += flare * taper * (1.0 - smoothstep(width * 0.5, width * 1.6, off));
      lit.y += flare * taper * (exp(-off / 0.07) * 0.9 + exp(-off / 0.4) * 0.14);
      if (forked < 0.5) continue;
      // A fork leaving the arc part of the way along, to the side it leans.
      float from = (e.y - 0.5) * span * 0.8;
      float past = along - from;
      float reach = span * (0.35 + 0.3 * e.z);
      if (past > 0.0 && past < reach) {
        float side = e.z < 0.5 ? -0.62 : 0.62;
        float root = lineNoise(from * 2.6 / gap + salt) * 0.23 * gap + lineNoise(from * 3.7 + salt + jump * 17.0) * 0.2;
        float fork = root + past * side + lineNoise(past * 4.5 + salt + jump * 13.0) * 0.16 * smoothstep(0.0, 0.3, past);
        float forkOff = abs(across - fork) * 0.85;
        float thin = flare * (1.0 - past / reach);
        lit.x += thin * 0.8 * (1.0 - smoothstep(width * 0.4, width * 1.3, forkOff));
        lit.y += thin * exp(-forkOff / 0.05) * 0.6;
      }
    }
  }
  return lit;
}

vec4 lightning(vec2 p, float d, float px) {
  vec2 arc = arcs(p, px, 2.4, 0.42, 1500.0, uDetail);
  // Crackles: short arcs that come and go faster, so the area is never long without one.
  if (uDetail > 0.5) arc += arcs(p + 7.3, px, 1.2, 0.3, 2300.0, 0.0) * vec2(0.95, 0.7);
  float cloud = 0.5 + gnoise((p - uDriftA.xy) * 0.75, vec2(TILE * 0.75));
  float within = inward(d, 0.45);
  // Between strikes the floor is only a little charged.
  float charged = within * (0.04 + 0.11 * cloud * cloud);
  float halo = min(arc.y, 1.0);
  float heart = min(arc.x, 1.0);
  float alpha = min(charged + halo * 0.62 + heart * 0.4, 0.95);
  vec3 colour = deepened(1.3) * 0.5 * charged + uTint * charged * 0.3 + mix(uTint, lifted(0.25), halo * halo) * halo * 0.85 + lifted(0.9) * heart;
  return vec4(colour, alpha);
}
`;
