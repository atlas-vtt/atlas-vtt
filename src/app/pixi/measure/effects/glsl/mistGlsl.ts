/**
 * Mist: two banks of fog crossing slowly and rolled by a third field, a veil over the whole area
 * that thins to nothing inside the outline and never follows it as a line. Its billows are lit in
 * the area's colour lifted and shaded in the colour deepened, so they show relief on dark and
 * bright maps alike.
 */
export const MIST_GLSL = `
vec4 mist(vec2 p, float d, float px) {
  int octaves = uDetail > 1.5 ? 3 : 2;
  vec2 roll = vec2(0.0);
  if (uDetail > 0.5) {
    vec2 r = (p - uDriftB.xy) * 0.5;
    roll = vec2(gnoise(r, vec2(TILE * 0.5)), gnoise(r + 31.7, vec2(TILE * 0.5)));
  }
  float near = fbm((p - uDriftA.xy) * 0.5 + roll * 0.6, vec2(TILE * 0.5), octaves, px * 0.5);
  float far = fbm((p - uDriftA.zw) - roll * 0.5 + 17.0, vec2(TILE), octaves, px);
  float bank = clamp(0.5 + near * 1.1 + far * 0.5, 0.0, 1.0);
  // The fog thins towards the outline, sooner where it is thin anyway.
  float thin = smoothstep(0.0, min(0.8, uDepth), d + (bank - 0.55) * 0.35);
  float alpha = thin * (0.31 + 0.19 * smoothstep(0.1, 0.9, bank));
  // Its shade is a cool grey of the colour, which darkens a bright map a little, so the veil shows there too.
  vec3 colour = mix(uTint * vec3(0.38, 0.42, 0.5), lifted(0.3) * 0.96, smoothstep(0.15, 0.85, bank));
  return vec4(colour * alpha, alpha);
}
`;
