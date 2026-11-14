/**
 * Frost: a sheet of ice over the floor with rime grown in from its outline. The sheet has depth:
 * clear ice in the colour deepened, milky bloom clouded into it, a few cracks wandering through
 * (each a dark hairline with the pale plane it runs down into the ice on one side) and a band of
 * light that passes slowly over it. Along the outline lies a grainy white crust that feathers
 * inwards unevenly, with short soft crystals growing out of it, each lying the way in from the
 * outline, in clumps of their own reach; the outline itself is eaten into, so the frost ends as
 * something grown. A slow breath moves how far the rime reaches, glints come and go and a low
 * mist drifts over it all. Rime is nearly white on ice that is darker than itself, so it shows on
 * a bright map as on a dark one, and the middle stays thin enough to read the map through.
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
 * The way into the area from this pixel, one long: up the distance field, whose two channels both
 * rise inwards (\`edgeDistance\`), read well to either side, so that the way turns gently where
 * two sides of the outline meet and their crystals fan round the corner.
 */
vec2 frostInward() {
  vec2 uv = (vPlace - uFieldRect.xy) / uFieldRect.zw;
  vec2 hop = 0.4 * uCell / uFieldRect.zw;
  vec2 rise = vec2(uFieldCode.x + uFieldCode.y, uFieldCode.z);
  vec2 up = vec2(
    dot(textureLod(uField, uv + vec2(hop.x, 0.0), 0.0).rg - textureLod(uField, uv - vec2(hop.x, 0.0), 0.0).rg, rise),
    dot(textureLod(uField, uv + vec2(0.0, hop.y), 0.0).rg - textureLod(uField, uv - vec2(0.0, hop.y), 0.0).rg, rise));
  return up / max(length(up), 1e-4);
}

/** Lays \`colour\` over \`under\` by \`cover\`. */
vec4 frostOver(vec4 under, vec3 colour, float cover) {
  return under * (1.0 - cover) + vec4(colour * cover, cover);
}

vec4 frost(vec2 p, float d, float px) {
  int octaves = uDetail > 1.5 ? 3 : 2;
  bool rich = uDetail > 0.5;
  // What is soft anyway (the bloom, the mist) is one octave where the fine things are left out.
  int soft = rich ? 2 : 1;
  float breath = fbm((p - uDriftA.xy) * 0.75, vec2(TILE * 0.75), octaves, px * 0.75);
  // The lie of the ice: two slow fields that bend what lies in it and tell one patch from the next.
  vec2 m = p * 1.1;
  vec2 lie = vec2(gnoise(m + 7.0, vec2(8192.0)), gnoise(m + 41.0, vec2(8192.0)));
  float grain = gnoise(p * 30.0, vec2(8192.0)) * shown(0.033, px);

  // Rime: how far it reaches in from the outline, patch by patch, further where the breath passes.
  float reach = min(0.6, uDepth * 0.8) * (0.6 + 0.65 * clamp(0.5 + lie.x * 1.3 + breath * 0.9, 0.0, 1.0));
  float crystal = 0.0;
  float clump = 0.0;
  if (d < reach * 1.7) {
    // Crystals grow straight in from the outline: whatever is read at the point of the outline a
    // pixel lies in from is the same all the way in, a line of it for every crystal.
    vec2 way = frostInward();
    vec2 foot = p - way * d;
    clump = gnoise(foot * 3.1 + way * 5.0 + 17.0, vec2(8192.0));
    // The crystals of a clump lean together, a little off the straight way in.
    vec2 root = foot + vec2(-way.y, way.x) * d * clump * 1.6;
    crystal = gnoise(root * 10.0 + way * (d * 1.6 + 3.0), vec2(8192.0)) * shown(0.1, px);
    // Finer ones among them, so no two are of a width.
    if (rich) crystal = crystal * 0.8 + 0.45 * gnoise(root * 23.0 + way * (d * 2.4 + 9.0), vec2(8192.0)) * shown(0.043, px);
  }
  // How long the crystals of this clump are, and how far along one this pixel lies.
  // (Well short of the area's middle: there the way in is anyone's, and crystals of two sides would meet in a seam.)
  float len = min(reach * clamp(0.85 + clump * 2.0, 0.45, 1.35), uDepth * 0.62);
  float along = d / len;
  // The crust: dense on the outline, soft, feathering inwards between its crystals.
  float crust = smoothstep(0.0, 0.75, 1.0 - along / 0.55 + crystal * 0.7) * (0.84 + grain * 0.5);
  // A crystal: broad where it leaves the crust, drawn to a soft tip; some lie brighter than others.
  float lean = mix(-0.08, 0.34, along);
  float tips = smoothstep(lean, lean + 0.3, crystal) * (1.0 - smoothstep(0.3, 0.92, along)) * (0.5 + 0.5 * smoothstep(-0.2, 0.25, lie.y - clump));
  float white = max(crust, tips * 0.85);
  // The outline is eaten into: the frost begins a little inside it, here more and there less.
  float bite = min(1.0, uDepth * 1.4) * (0.07 * clamp(0.4 - clump * 1.5 - lie.y, 0.0, 1.0) + 0.02 * clamp(0.5 - crystal * 2.0, 0.0, 1.0));
  float within = smoothstep(bite, bite + 0.05, d);

  // The sheet: clear ice, with bloom clouded into it.
  vec2 bent = p + lie * 0.4;
  float cloud = fbm(bent * 0.7 + 3.0, vec2(8192.0), soft, px * 0.7);
  float bloom = smoothstep(-0.1, 0.26, cloud) * (0.85 + grain * 0.22);
  // Light passing slowly over the ice in broad bands, which its lie bends.
  float band = 0.5 + 0.5 * sin(TAU * (dot(p, vec2(0.23, 0.14)) + breath * 0.8 + lie.x * 0.5 - cycles(410.0)));
  float sheen = band * band * band * band;
  // Cracks: the seams of a net of plates, of which only some stretches have opened.
  vec3 net = voronoiFast(bent * 0.875 + 11.0, vec2(TILE * 0.875), 0.0);
  float seam = net.y / 0.875;
  float open = smoothstep(0.0, 0.22, lie.y + cloud * 0.6);
  float hair = open * (1.0 - smoothstep(0.003 + px * 0.5, 0.007 + px * 1.3, seam));
  // A crack runs down into the ice at a slant, and its plane shows pale on one side of it.
  float plane = open * step(0.5, net.z) * (1.0 - smoothstep(0.0, 0.1, seam)) * shown(0.1, px);

  vec3 clear = deepened(2.4) * 0.74;
  vec3 milk = lifted(0.72);
  // Deeper under the rime, by how far it reaches hereabouts (not by its crystals, whose seams would show in it).
  vec4 lit = vec4(clear, 1.0) * (0.3 + 0.36 * (1.0 - smoothstep(0.3, 1.3, d / reach)));
  lit = frostOver(lit, milk, bloom * (0.36 + 0.3 * sheen) + sheen * 0.06);
  lit = frostOver(lit, milk, plane * 0.4);
  lit = frostOver(lit, deepened(3.0) * 0.4, hair * 0.7);
  lit = frostOver(lit, lifted(0.94), white * 0.94);
  lit *= within;

  // A low mist drifting over it, in the colour lifted.
  float veil = fbm((p - uDriftA.zw * 4.0) * 0.5 + 9.0, vec2(TILE * 0.5), soft, px * 0.5);
  float haze = within * smoothstep(0.0, 0.45, veil + 0.12) * 0.16;
  lit = frostOver(lit, lifted(0.8), haze);

  float star = rich ? glint(p, px) * within : 0.0;
  lit += vec4(vec3(1.0) * star * 0.9, star * 0.5);
  return lit;
}
`;
