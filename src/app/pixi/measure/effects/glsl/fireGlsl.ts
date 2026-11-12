/**
 * Fire: tongues that rise up the screen, thick and bright at the area's heart and thinning to
 * tips towards its outline, with embers climbing through them. Its colour runs from the deepened
 * tint at the tips through the tint itself to a bright heart, so fire in green is green fire.
 */
export const FIRE_GLSL = `
/** Embers: sparks carried up, each glowing for a part of its life. */
float embers(vec2 p, float px) {
  vec4 s = spark(p - uDriftB.zw, 0.4, 1100.0, 900.0);
  if (s.w > 0.45) return 0.0;
  float life = smoothstep(0.0, 0.08, s.z) * (1.0 - smoothstep(0.3, 0.75, s.z));
  float size = 0.03 + 0.025 * s.w;
  return life * (1.0 - smoothstep(size * 0.35, size, length(s.xy))) * shown(0.1, px);
}

vec4 fire(vec2 p, float d, float px) {
  float heart = inward(d, 1.1);
  // A narrow area keeps more of its width for its flames.
  float within = smoothstep(0.0, min(0.4, uDepth * 0.6), d);
  int octaves = uDetail > 1.5 ? 3 : 2;
  float sway = gnoise((p - uDriftB.xy) * 0.75, vec2(TILE * 0.75));
  vec2 bent = p + vec2(sway * 0.32, 0.0);
  // Broad tongues, drawn out the way they rise.
  float broad = fbm((bent - uDriftA.xy) * vec2(1.75, 0.75), TILE * vec2(1.75, 0.75), octaves, px * 1.75);
  // Fine licks climbing faster over them.
  float lick = uDetail > 0.5 ? gnoise((bent - uDriftA.zw) * vec2(4.0, 1.5), TILE * vec2(4.0, 1.5)) * shown(0.25, px) : 0.0;
  float body = broad * 1.6 + lick * 0.5;
  // Flames stand thick at the heart; towards the outline only the tallest tongues are left, so its edge is theirs.
  float flame = smoothstep(-0.12, 0.3, body + heart * 0.22 - 0.04 - (1.0 - within) * 0.55) * smoothstep(0.0, 0.3, within);
  float heat = flame * (0.45 + 0.55 * heart) + max(lick, 0.0) * flame * 0.4;

  vec3 ember = deepened(2.0) * 0.8;
  vec3 hot = mix(deepened(0.45), vec3(1.0), 0.3);
  vec3 colour = mix(ember, uTint, smoothstep(0.08, 0.5, heat));
  colour = mix(colour, hot, smoothstep(0.55, 1.0, heat));
  // The floor glows a little all over; a flame lays its pigment on thickly and lights from its heat.
  float alpha = within * 0.06 + 0.4 * smoothstep(0.0, 0.5, flame);
  float glow = within * 0.03 + 0.26 * heat * heat;
  vec4 lit = vec4(colour * (alpha + glow), alpha);

  float sparks = uDetail > 0.5 ? embers(p, px) * within : 0.0;
  lit += vec4(hot * sparks, sparks * 0.6);
  return lit;
}
`;
