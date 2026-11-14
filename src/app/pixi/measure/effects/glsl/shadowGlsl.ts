/**
 * Shadow: darkness that curls, lying thick over the area's middle and breaking into wisps towards
 * its outline. Its heart is the area's colour deepened almost to black and only darkens, so it is
 * darker than a map that is dark already; the colour itself shows only at the rim, in the wisps
 * and where the dark thins.
 */
export const SHADOW_GLSL = `
vec4 shadow(vec2 p, float d, float px) {
  float middle = inward(d, 1.4);
  float within = inward(d, 0.35);
  int octaves = uDetail > 1.5 ? 3 : 2;
  // A slow field turns the dark about itself: each point is read a little way around its curl.
  vec2 c = (p - uDriftA.xy) * 0.5;
  vec2 curl = vec2(gnoise(c, vec2(TILE * 0.5)), gnoise(c + 23.1, vec2(TILE * 0.5)));
  vec2 swirled = p + vec2(-curl.y, curl.x) * 1.5;
  float dark = fbm((swirled - uDriftA.zw) * 0.875, vec2(TILE * 0.875), octaves, px * 0.875);
  // Wisps: thin curls drawn out along the same turning.
  float wisp = 0.0;
  if (uDetail > 0.5) {
    float line = gnoise((swirled - uDriftB.xy) * 1.5 + curl * 1.2, vec2(TILE * 1.5));
    wisp = pow(max(1.0 - abs(line) * 2.6, 0.0), 2.0) * shown(0.3, px);
  }
  // Thick over the middle; towards the outline what is left of it is wisps.
  float thick = smoothstep(0.1, 0.85, middle * 0.6 + dark * 1.2 + 0.2);
  float density = within * max(thick, wisp * (0.7 - 0.35 * middle) * smoothstep(0.2, 0.75, 0.55 + dark + middle * 0.3));
  float alpha = density * (0.62 + 0.16 * clamp(0.5 + dark * 1.4, 0.0, 1.0));
  // The rim: where the dark thins and in its wisps, away from the middle.
  float rim = (1.0 - middle) * (density * (1.0 - density) * 4.0 * 0.16 + within * wisp * (1.0 - thick) * 0.1);
  vec3 colour = deepened(1.5) * 0.05 * alpha + uTint * rim;
  return vec4(colour, alpha);
}
`;
