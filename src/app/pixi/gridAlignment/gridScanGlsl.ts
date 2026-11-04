// The grid scan's program; `gridScanShader.ts` makes the shader of it and sets its uniforms.
//
// The uniform names keep clear of the ones PIXI sets itself on every mesh shader (uColor, uRound,
// uResolution and the three matrices). PIXI compiles a mesh's program as GLSL ES 1.00, which has no
// explicit texture level, so every texture is read in main itself, outside every branch and loop:
// ANGLE's Direct3D backend rejects implicit gradients in control flow.

// World coordinates run to tens of thousands of pixels and a line is a pixel wide: PIXI's default
// precision (mediump) may be as little as ten bits, which is what software renderers give.
export const GRID_SCAN_VERTEX = `
precision highp float;
in vec2 aPosition;
out vec2 vWorld;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vWorld = aPosition;
}`;

// A lattice is drawn from the distance to its nearest line: squares from the nearer of the two
// line families, hexes from the nearest cell centre, whose six sides lie half a cell from it.
// Hexes measure flat to flat, and the lattice's origin is the corner of the box around hex (0, 0),
// as the grid drawers have it.
//
// Nothing here is a drawn line but the grid itself, and nothing switches on. The light is white
// and every bright thing has a soft dark under it, so it reads on a pale map as on a dark one and
// takes no side with any theme. While Atlas looks, the map dims a little but for patches that
// drift over it like sun through leaves, the map's lines glint where a patch lies, and each grid the
// search tries shows faintly for a moment, so the search can be watched. A grid is
// etched into the map: first along the lines of the map it lies on, then outward from there, each
// place at its own moment; where it has just been cut it glows, and the glow dies down to the
// line. The answer comes with one swell in the map: where it passes, the map's own picture is bent
// a few pixels along its way (the shape Apple's ripple has: a sine that dies away), and behind it
// the grid stands sharp in its own colour while the last glow slowly goes. A slow field pushes the
// swell out and holds it back, so it is never a circle.
export const GRID_SCAN_FRAGMENT = `
precision highp float;
in vec2 vWorld;

uniform vec4 uMapRect;
uniform float uPixelSize;
uniform float uSeconds;
uniform vec3 uLineColor;
uniform vec2 uOrigin;
uniform float uReach;
uniform float uScrim;
uniform float uLooking;
uniform vec2 uLock;
uniform vec3 uInkRowX;
uniform vec3 uInkRowY;
uniform vec3 uHas;
uniform vec3 uFrontRowX;
uniform vec3 uFrontRowY;
uniform vec4 uFrontShape;
uniform vec2 uFrontLook;
uniform vec3 uBackRowX;
uniform vec3 uBackRowY;
uniform vec4 uBackShape;
uniform vec2 uBackLook;
uniform vec3 uTrialRowX;
uniform vec3 uTrialRowY;
uniform vec4 uTrialShape;
uniform vec2 uTrialLook;
uniform sampler2D uInk;
uniform sampler2D uHits;
uniform sampler2D uPicture;

// A swell: how far it bends the map at its height, in pixels of the screen; how fast it rises and
// falls, and how soon it dies away, per second; and the seconds it takes from the origin to the
// farthest corner.
const float SWELL_PIXELS = 13.0;
const float SWELL_RATE = 9.0;
const float SWELL_DECAY = 4.5;
const float SWELL_SECONDS = 1.5;
// The first swell, as the search begins, is the quieter of the two.
const float FIRST_SWELL = 0.5;
// How much brighter a crest is, and darker a trough: on a pale map only the dark shows, so it is the lesser.
const float SWELL_SHINE = 0.14;
const float SWELL_SHADE = 0.1;
// The light: white, a little warm.
const vec3 LIGHT = vec3(1.0, 0.985, 0.955);
// Where the light on a swell comes from: the upper left, as on every raised thing in an interface.
const vec2 LIGHT_FROM = vec2(-0.5, -0.866);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), u.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), u.x), u.y);
}

// Three octaves, about 0 to 0.875.
float field(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    sum += weight * valueNoise(p);
    p = p * 2.03 + 17.1;
    weight *= 0.5;
  }
  return sum;
}

// x: the distance to the nearest line; yz: from the point to the middle of its cell.
vec3 cellOf(vec2 p, vec4 shape) {
  float cell = shape.x;
  vec2 q = p - shape.zw;
  if (shape.y < 0.5) {
    vec2 inCell = (fract(q / cell) - 0.5) * cell;
    vec2 toLine = cell * 0.5 - abs(inCell);
    return vec3(min(toLine.x, toLine.y), -inCell);
  }
  float radius = cell * 0.57735027;
  q -= shape.y < 1.5 ? vec2(cell * 0.5, radius) : vec2(radius, cell * 0.5);
  if (shape.y > 1.5) q = q.yx;
  vec2 period = vec2(cell, 3.0 * radius);
  vec2 halfPeriod = period * 0.5;
  vec2 a = mod(q, period) - halfPeriod;
  vec2 b = mod(q - halfPeriod, period) - halfPeriod;
  vec2 fromCentre = dot(a, a) < dot(b, b) ? a : b;
  vec2 folded = abs(fromCentre);
  float toLine = cell * 0.5 - max(folded.x, dot(folded, vec2(0.5, 0.8660254)));
  return vec3(toLine, shape.y > 1.5 ? -fromCentre.yx : -fromCentre);
}

// The height of a swell, -1 to 1, at a place its front passed 'since' seconds ago: nothing before
// it arrives, a rise and a fall that die away after.
float swellAt(float since) {
  float after = max(since, 0.0);
  return sin(SWELL_RATE * after) * exp(-SWELL_DECAY * after);
}

// How steeply the swell's surface rises (above 0) or falls along its way, -1 to 1. The swell sets
// in over a moment: a slope that began at once would be an edge, which is a line.
float swellSlope(float since) {
  float after = max(since, 0.0);
  float slope = (cos(SWELL_RATE * after) - SWELL_DECAY / SWELL_RATE * sin(SWELL_RATE * after)) * exp(-SWELL_DECAY * after);
  return slope * smoothstep(0.0, 0.16, since);
}

// A glow that comes and goes around a front without an edge on either side: 'ahead' is the
// distance in front of it, negative behind.
float veil(float ahead, float before, float after) {
  float width = ahead > 0.0 ? before : after;
  return exp(-ahead * ahead / (width * width));
}

void main() {
  vec2 onMap = vWorld / uReach;
  vec2 fromOrigin = vWorld - uOrigin;
  float range = length(fromOrigin);
  vec2 outward = fromOrigin / max(range, 1e-3);
  // Near the origin a swell is still round; it loosens as it goes.
  float loose = (field(onMap * 2.0 - vec2(uSeconds * 0.13, uSeconds * 0.1)) - 0.44) * 0.18 * uReach * smoothstep(0.0, 0.3 * uReach, range);
  float d = range + loose;

  // The swells: one as the search begins, one with the answer. The answer's front is where uLock.x says.
  float pace = uReach / SWELL_SECONDS;
  float first = swellAt(uSeconds - d / pace) * FIRST_SWELL;
  float answer = swellAt((uLock.x - d) / pace) * uLock.y;
  float height = first + answer;
  float bend = height * SWELL_PIXELS * uPixelSize;
  // The side of the swell that faces the light is bright and the side turned from it dark, as on water.
  float slope = swellSlope(uSeconds - d / pace) * FIRST_SWELL + swellSlope((uLock.x - d) / pace) * uLock.y;
  float facing = -slope * dot(outward, LIGHT_FROM);

  // Every texture is read here, before any branch: the map's picture where the swell has bent it,
  // its colours a little apart as glass parts them.
  vec2 inkAt = vec2(dot(uInkRowX, vec3(vWorld, 1.0)), dot(uInkRowY, vec3(vWorld, 1.0)));
  vec2 perBend = vec2(dot(uInkRowX.xy, outward), dot(uInkRowY.xy, outward)) * bend;
  float ink = texture(uInk, inkAt).r * uHas.x;
  float hits = texture(uHits, (vWorld - uMapRect.xy) / uMapRect.zw).a * uHas.y;
  vec3 picture = vec3(texture(uPicture, inkAt + perBend * 1.07).r, texture(uPicture, inkAt + perBend).g, texture(uPicture, inkAt + perBend * 0.93).b);
  // Bent by less than a pixel the map is as it lies; there the layer shows nothing of it.
  float bent = smoothstep(0.15, 1.0, abs(height) * SWELL_PIXELS) * uHas.z;

  // Looking: the map dims but for patches that drift over it, and its lines glint where a patch lies.
  // Two layers that drift apart, a small one over a wide slow one, as clouds have.
  float patches = smoothstep(0.34, 0.64, field(onMap * 1.7 + vec2(uSeconds * 0.3, -uSeconds * 0.23)))
    * (0.6 + 0.4 * smoothstep(0.3, 0.7, field(onMap * 0.8 + vec2(-uSeconds * 0.1, uSeconds * 0.07) + 11.0)));
  float shimmer = 0.6 + 0.8 * field(onMap * 9.0 + uSeconds * 0.5);
  // Faintly: white over a map's black ink soon reads as the ink rubbed away.
  float glint = uLooking * patches * ink * 0.08 * shimmer;
  float dusk = uLooking * 0.13 * (1.0 - patches);

  // Locked: the grid stands sharp where the answer's swell has been, over a stretch and not at a line.
  float aheadOfLock = d - uLock.x;
  float sharp = 1.0 - smoothstep(-0.16 * uReach, 0.02 * uReach, aheadOfLock);
  float arriving = veil(aheadOfLock + 0.06 * uReach, 0.1 * uReach, 0.3 * uReach) * uLock.y;
  // The answer's own lines on the map, bright while the swell is near.
  float found = hits * arriving;
  // How lately the swell passed: highest a little behind its front, then falling.
  float heat = arriving * sharp;

  // When a place takes a grid that grows: early on the map's own lines, elsewhere by a field of its own.
  // A fine grain makes the edge of what is cut ragged, as a hand's work is.
  float spreads = 0.66 * field(onMap * 3.3 + 7.3) / 0.875;
  float takes = spreads + 0.26 * (1.0 - ink * uHas.x) + 0.08 * valueNoise(onMap * 24.0 + 3.0);
  const float GROW_EDGE = 0.3;

  // The grid in front.
  float lines = 0.0;
  float bloom = 0.0;
  float under = 0.0;
  float spill = 0.0;
  float sparks = 0.0;
  if (uFrontShape.x > 0.0) {
    vec2 p = vec2(dot(uFrontRowX, vec3(vWorld, 1.0)), dot(uFrontRowY, vec3(vWorld, 1.0)));
    float pixel = uPixelSize * length(uFrontRowX.xy);
    // The grid rides the swell with the map it lies on.
    vec3 cell = cellOf(p + vec2(dot(uFrontRowX.xy, outward), dot(uFrontRowY.xy, outward)) * bend, uFrontShape);
    // A grid still looked for never stands quite sharp: that is the answer's alone.
    float soft = mix(0.3, 1.0, uFrontLook.y) * (1.0 - sharp);
    // Lines and their glow keep to a share of the cell, so small cells stay cells.
    // The answer's lines stand a little heavier while the swell is on them, and settle.
    float halfWidth = min(mix(0.85, 3.0, soft) * (1.0 + 0.25 * heat) * pixel, 0.09 * uFrontShape.x);
    // Cells of a few pixels are a wash of lines, not a grid.
    float readable = smoothstep(5.0, 12.0, uFrontShape.x / pixel);
    float roomy = smoothstep(10.0, 36.0, uFrontShape.x / pixel);
    float grown = smoothstep(takes, takes + GROW_EDGE, uFrontLook.x * (1.0 + GROW_EDGE));
    float shown = mix(grown, 1.0, sharp * uLock.y) * readable;
    lines = exp(-cell.x * cell.x / (halfWidth * halfWidth)) * mix(1.0, 0.6, soft) * shown;
    // Where a line has just been cut it glows; the glow dies down to the line.
    float fresh = grown * (1.0 - grown) * 4.0 * (1.0 - sharp);
    float halo = min(halfWidth * 4.5, 0.18 * uFrontShape.x);
    float around = exp(-cell.x * cell.x / (halo * halo)) * shown * roomy;
    // The answer keeps a glow of its own after the swell, which goes with uLock.y.
    bloom = around * (0.08 * (1.0 - sharp) + 0.55 * fresh + 0.4 * heat + 0.24 * sharp * uLock.y);
    // Light spills from where the cutting is, over the map around it and not only along the lines.
    float cutting = smoothstep(spreads + 0.17, spreads + 0.17 + GROW_EDGE, uFrontLook.x * (1.0 + GROW_EDGE));
    spill = cutting * (1.0 - cutting) * 4.0 * 0.07 * (1.0 - sharp) * readable;
    // And on the lines just cut a few glints come and go, each in its own time.
    vec2 grain = p / (pixel * 7.0);
    vec2 inGrain = fract(grain) - 0.5;
    float twinkle = pow(max(0.0, sin(uSeconds * 5.0 + hash(floor(grain)) * 6.2832)), 10.0);
    sparks = exp(-dot(inGrain, inGrain) * 34.0) * twinkle * fresh * around * 0.8;
    // The dark under a bright line, a little wider than it: what makes white read on pale paper.
    float casing = min(halfWidth * 2.4, 0.12 * uFrontShape.x);
    under = exp(-cell.x * cell.x / (casing * casing)) * 0.32 * shown * (1.0 - sharp * (1.0 - max(heat, 0.7 * uLock.y)));
  }

  // The grid it takes over from, never where the answer already stands.
  float before = 0.0;
  if (uBackShape.x > 0.0) {
    vec2 p = vec2(dot(uBackRowX, vec3(vWorld, 1.0)), dot(uBackRowY, vec3(vWorld, 1.0)));
    float pixel = uPixelSize * length(uBackRowX.xy);
    float halfWidth = min(mix(0.85, 3.2, mix(0.3, 1.0, uBackLook.y)) * pixel, 0.09 * uBackShape.x);
    float toLine = cellOf(p, uBackShape).x;
    float left = smoothstep(takes, takes + GROW_EDGE, uBackLook.x * (1.0 + GROW_EDGE));
    before = exp(-toLine * toLine / (halfWidth * halfWidth)) * 0.6 * left * smoothstep(5.0, 12.0, uBackShape.x / pixel) * (1.0 - sharp);
  }

  // The grid being tried just now: faint, in blotches that wander, and never where the answer stands.
  float trying = 0.0;
  if (uTrialShape.x > 0.0) {
    // A grid being tried comes into place as a lens finds its focus: a little too large, then right.
    vec2 pulled = uOrigin + (vWorld - uOrigin) * (1.0 - 0.03 * (1.0 - uTrialLook.x));
    vec2 p = vec2(dot(uTrialRowX, vec3(pulled, 1.0)), dot(uTrialRowY, vec3(pulled, 1.0)));
    float pixel = uPixelSize * length(uTrialRowX.xy);
    float halfWidth = min(1.8 * pixel, 0.08 * uTrialShape.x);
    float toLine = cellOf(p, uTrialShape).x;
    float blotches = smoothstep(0.38, 0.62, field(onMap * 2.3 + vec2(-uSeconds * 0.26, uSeconds * 0.2) + 3.1));
    float there = uTrialLook.x * blotches * smoothstep(5.0, 12.0, uTrialShape.x / pixel) * (1.0 - sharp);
    trying = exp(-toLine * toLine / (halfWidth * halfWidth)) * 0.3 * there;
    float casing = halfWidth * 2.4;
    under = 1.0 - (1.0 - under) * (1.0 - exp(-toLine * toLine / (casing * casing)) * 0.16 * there);
  }

  // Lines being cut are light; the answer's are light where the swell is and the grid's own colour behind it.
  vec3 lineColor = mix(LIGHT, mix(uLineColor, LIGHT, clamp(heat * 0.75 + 0.35 * uLock.y, 0.0, 0.85)), sharp);
  float glow = glint + arriving * 0.04 + bloom + before + trying + spill + sparks;
  vec3 lightColor = LIGHT * (glow + found * 0.6) + lineColor * lines;
  float lightCover = clamp(max(max(glow, lines), found * 0.6), 0.0, 1.0);

  // The map dims a little under the scan, more towards its rim, which draws the eye in.
  float rim = uScrim * (0.55 + 0.8 * smoothstep(0.1, 1.1, range / uReach));
  float scrim = 1.0 - (1.0 - rim) * (1.0 - dusk) * (1.0 - under);

  // From the bottom: the bent map (or the map as it lies, which is nothing of this layer's), the
  // swell's shine and shade on it, the dimming, the light.
  float shine = (0.4 * max(height, 0.0) + max(facing, 0.0)) * SWELL_SHINE;
  float shade = (0.4 * max(-height, 0.0) + max(-facing, 0.0)) * SWELL_SHADE;
  vec4 surface = vec4(picture * bent, bent);
  surface = vec4(surface.rgb * (1.0 - shade) + vec3(shine), shade + shine + surface.a * (1.0 - shade - shine));
  surface = vec4(surface.rgb * (1.0 - scrim), scrim + surface.a * (1.0 - scrim));
  // A grain finer than the eye sees, so the soft dimming and the glows have no steps in them.
  float dither = (hash(gl_FragCoord.xy + fract(uSeconds) * 61.0) - 0.5) / 255.0;
  float alpha = clamp(lightCover + surface.a * (1.0 - lightCover) + dither * 1.5, 0.0, 1.0);
  gl_FragColor = vec4(min(lightColor + surface.rgb * (1.0 - lightCover), vec3(alpha)), alpha);
}`;
