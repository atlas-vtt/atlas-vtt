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

// The snapshot texel of a level below that holds w: worked out from the stack texel holding w, as
// stackAt reads it, so it always lies in that stack texel and never shows a neighbour's.
ivec2 snapshotTexel(vec2 w) {
  vec2 cell = floor(w / uStackTexel);
  float sub = uBelowGrid.z;
  vec2 inside = clamp(floor((w - cell * uStackTexel) * sub / uStackTexel), vec2(0.0), vec2(sub - 1.0));
  return ivec2((cell - uBelowGrid.xy) * sub + inside);
}

// What a texel that shows level \`shown\` holds of it at w: its snapshot as it holds it in this very
// stack texel, dimmed by uBelowDim once per level down; \`nothing\` where no snapshot of it is bound.
vec3 belowAt(int shown, vec2 w, vec3 nothing) {
  ivec2 snap = snapshotTexel(w);
  if (shown == 1 && uBelowShown.x > 0.5) return texelFetch(uBelow1, clamp(snap, ivec2(0), textureSize(uBelow1, 0) - 1), 0).rgb * uBelowDim;
  if (shown == 2 && uBelowShown.y > 0.5) return texelFetch(uBelow2, clamp(snap, ivec2(0), textureSize(uBelow2, 0) - 1), 0).rgb * (uBelowDim * uBelowDim);
  return nothing;
}`;
