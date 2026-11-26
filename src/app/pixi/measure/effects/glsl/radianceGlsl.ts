/**
 * Radiance: soft rays that fan out from the area's origin and turn slowly, broad ones one way and
 * finer ones the other, around a glowing heart, with motes hanging in them. It tints the floor in
 * the area's colour and lights it in the colour lifted, strongest at the origin.
 */
export const RADIANCE_GLSL = `
vec4 radiance(vec2 p, float d, float px) {
  float r = length(p);
  float turn = atan(p.y, p.x) / TAU;
  // How much of a turn one screen pixel covers here: near the origin the rays are finer than it.
  float arc = px / max(r * TAU, 1e-4);
  float broad = ringNoise((turn + cycles(30.0)) * 9.0, 9.0, uSeed.x) * shown(1.0 / 9.0, arc);
  float fine = ringNoise((turn - cycles(47.0)) * 22.0, 22.0, uSeed.y) * shown(1.0 / 22.0, arc);
  float third = uDetail > 0.5 ? ringNoise((turn + cycles(71.0)) * 37.0, 37.0, uSeed.x + 91.0) * shown(1.0 / 37.0, arc) : 0.0;
  float rays = smoothstep(0.25, 0.88, 0.5 + broad * 0.85 + fine * 0.8 + third * 0.5);
  // Rays fade along their length; the heart glows whatever way they turn.
  float far = clamp(r / uReach, 0.0, 1.0);
  float fall = 1.0 - smoothstep(0.1, 1.05, far);
  float heart = exp(-far * far * 14.0);
  float light = clamp(rays * (0.2 + 0.8 * fall) * smoothstep(0.02, 0.16, far) + heart * 0.5, 0.0, 1.0);

  float within = inward(d, 0.5);
  float alpha = within * (0.05 + 0.29 * light);
  vec3 colour = mix(uTint, lifted(0.35), light * light);
  vec4 lit = vec4(colour * alpha + lifted(0.5) * within * (0.03 + 0.3 * light * light), alpha);

  if (uDetail > 0.5) {
    vec4 s = spark(p - uDriftA.xy, 0.64, 700.0, 700.0);
    float life = smoothstep(0.0, 0.25, s.z) * (1.0 - smoothstep(0.45, 0.9, s.z));
    float size = 0.022 + 0.02 * s.w;
    float mote = s.w < 0.7 ? within * life * (1.0 - smoothstep(size * 0.3, size, length(s.xy))) * shown(0.08, px) : 0.0;
    lit += vec4(lifted(0.8) * mote * 0.8, mote * 0.4);
  }
  return lit;
}
`;
