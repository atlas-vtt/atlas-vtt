/**
 * Slow rafts of cooling rock over the map's molten pigment. Small, broken channels rather than
 * neon outlines: the banks hold their crust, the centre opens. Engravings cut that same motion
 * into burin strokes in their own ink; no additive light is ever painted over a print.
 */
export const LAVA_GLSL = `
/** Antialiased periodic ink coverage, integrating a stripe over the pixel footprint. */
float lavaHatchIntegral(float x, float width) {
  return floor(x) * width + min(fract(x), width);
}
float lavaHatch(float x, float width, float footprint) {
  float span = max(footprint, 0.0001);
  return (lavaHatchIntegral(x + span * 0.5, width) - lavaHatchIntegral(x - span * 0.5, width)) / span;
}

vec4 lava(vec2 q, float d, float px, float near) {
  float depth = smoothstep(0.03, 1.1, d);
  int octaves = uDetail > 1.5 ? 2 : 1;
  vec2 w = (q - uDriftA.xy) * 0.5;
  float bend = fbm(w, vec2(TILE * 0.5), octaves, px * 0.5);
  float crossBend = uDetail > 0.5 ? gnoise(w + vec2(9.0, 3.0), vec2(TILE * 0.5)) : bend * 0.6;
  // The fine surface moves with the plates: it never swims independently across their faces.
  vec2 p = q - uDriftA.zw + vec2(bend, crossBend) * 0.5;
  // Fold the seams at a smaller scale than the rafts; the coarse warp alone made a regular
  // cellular paving pattern. This roughness travels with the rock, never flickers on top of it.
  vec2 wrinkles = (q - uDriftA.zw) * 3.0;
  float fold = gnoise(wrinkles, vec2(TILE * 3.0));
  float crossFold = uDetail > 0.5 ? gnoise(wrinkles + 13.0, vec2(TILE * 3.0)) : fold;
  p += vec2(fold, crossFold) * 0.26;
  float heat = 0.5 + fbm((q - uDriftB.xy) * 0.75, vec2(TILE * 0.75), octaves, px * 0.75);
  vec3 plate = voronoiFast(p * 2.5, vec2(TILE * 2.5), 0.0);
  float edge = plate.y / 2.5;
  float width = mix(0.005, 0.026, depth) * (0.7 + heat * 0.6);
  float seam = 1.0 - smoothstep(width, width + max(px, 0.006), edge);
  seam *= smoothstep(0.3, 0.67, heat + plate.z * 0.18);
  float crust = smoothstep(width * 0.5, width + max(px, 0.014), edge);
  // In the hottest parts a raft thins into open melt; cool banks retain the fine dark rock.
  crust *= 1.0 - smoothstep(0.55, 0.78, heat + plate.z * 0.1) * depth * 0.65;
  float grain = 0.0;
  if (uDetail > 1.5) grain = gnoise(p * 8.0, vec2(TILE * 8.0)) * shown(0.125, px) * near;

  if (uEngraved > 0.5) {
    // The static artwork's 45-degree burin direction. Only width and broken lengths breathe;
    // strokes stay planted on the paper, avoiding the shimmer of scrolling fine ruled lines.
    vec2 paper = vWorld / uCell;
    float spacing = 0.046 * 0.7;
    float tone = clamp((0.30 - depth * 0.14 + crust * 0.16 - seam * 0.18) / uLavaGlow, 0.06, 0.75);
    float ink = lavaHatch((paper.y - paper.x) * 0.70710678 / spacing, tone, px / spacing);
    vec3 colour = mix(uSurface, uDeep, ink);
    return vec4(colour, 1.0);
  }

  vec3 rock = mix(uDeep, uSurface, 0.06 + plate.z * 0.10 + grain * 0.15);
  vec3 melt = mix(uSurface, uGlint, depth * (0.14 + heat * 0.2));
  vec3 pigment = mix(melt, rock, crust * (0.86 - depth * 0.16));
  pigment = mix(pigment, melt * uLavaGlow, seam * (0.18 + depth * 0.55));
  // Ordinary pigment blending leaves the map's grain, bank ink and grid visible, without clipping
  // bright channels to white. The light itself is the linked area light's shared smoulder sample.
  float alpha = 0.55;
  return vec4(pigment * alpha, alpha);
}
`;
