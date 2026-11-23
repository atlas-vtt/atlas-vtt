/**
 * How a pass reads the openings of a view (read only while uHasBelow is set): uStack holds the
 * level stack (`LevelStack`, `LevelStackTexture`) on its box of texels (uStackBox, uStackTexel,
 * uStackGrid): red is the level each texel shows, 0 the one the view shows, 1 and 2 the levels
 * below drawn (nearest first), 255 nothing. uBelow1 and uBelow2 are those levels' snapshots
 * (`BelowSnapshots`), drawn in world space over the stack's box from texel uBelowGrid.xy,
 * uBelowGrid.z of their texels a side in a stack texel, where uBelowShown says there is one.
 * Everything is read texel by texel, so the picture and the rule read the same byte. The lit
 * view's composite and the openings of a scene without lighting both read through these.
 */
export const STACK_GLSL = `
uniform sampler2D uStack;
uniform vec4 uStackBox;
uniform vec2 uStackGrid;
uniform float uStackTexel;
uniform float uHasBelow;
uniform sampler2D uBelow1;
uniform sampler2D uBelow2;
uniform vec2 uBelowShown;
uniform float uBelowDim;
uniform vec3 uBelowGrid;

// The level the stack shows at world point w: 0 the one the view shows (also off the stack's grid
// and box), 1 or 2 a level below drawn, 255 nothing. The texel holding w decides, as the rule's shownAt.
int stackAt(vec2 w) {
  if (uHasBelow < 0.5) return 0;
  vec2 cell = floor(w / uStackTexel);
  if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, uStackGrid))) return 0;
  vec2 local = cell - uStackBox.xy;
  if (any(lessThan(local, vec2(0.0))) || any(greaterThanEqual(local, uStackBox.zw))) return 0;
  return int(texelFetch(uStack, ivec2(local), 0).r * 255.0 + 0.5);
}

// What level \`shown\`'s snapshot \`snap\` holds at w, filtered between the four snapshot texels around
// w (bilinear) but only those whose own stack texel shows that level too: a neighbour that shows
// the viewed level or nothing is left out and the others weighted up, so a pixel never shows a
// picture the stack does not show at that texel, and a snapshot coarser than the screen is soft,
// not square. The texel holding w always counts (its weight is at least a quarter).
vec3 snapshotAt(sampler2D snap, int shown, vec2 w) {
  float sub = uBelowGrid.z;
  float texel = uStackTexel / sub;
  vec2 p = w / texel - 0.5;
  vec2 base = floor(p);
  vec2 f = p - base;
  ivec2 last = textureSize(snap, 0) - 1;
  vec2 origin = uBelowGrid.xy * sub;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      vec2 g = base + vec2(float(i), float(j));
      if (stackAt((g + 0.5) * texel) != shown) continue;
      float weight = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
      sum += texelFetch(snap, clamp(ivec2(g - origin), ivec2(0), last), 0).rgb * weight;
      total += weight;
    }
  }
  return total > 0.0 ? sum / total : vec3(0.0);
}

// What a texel that shows level \`shown\` holds of it at w: its snapshot (snapshotAt), dimmed by
// uBelowDim once per level down; \`nothing\` where no snapshot of it is bound.
vec3 belowAt(int shown, vec2 w, vec3 nothing) {
  if (shown == 1 && uBelowShown.x > 0.5) return snapshotAt(uBelow1, 1, w) * uBelowDim;
  if (shown == 2 && uBelowShown.y > 0.5) return snapshotAt(uBelow2, 2, w) * (uBelowDim * uBelowDim);
  return nothing;
}`;
