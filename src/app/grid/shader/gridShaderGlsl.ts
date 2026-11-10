import { GLSL_VERSION } from '../../pixi/lighting/engine/glsl';

// The grid's program; `gridShader.ts` makes the shader of it and sets its uniforms. The uniform
// names keep clear of the ones PIXI sets itself on every mesh shader (uColor, uRound, uResolution
// and the three matrices). World coordinates run to tens of thousands of pixels and a line is a
// pixel wide, so both stages are highp.

/** How `kindOf` tells the grid types apart (`uShape.y`). */
export const GRID_SHADER_KIND = { square: 0, 'hex-vertical': 1, 'hex-horizontal': 2 } as const;
/** The line styles (`uStyle.x`). */
export const GRID_SHADER_STYLE = { solid: 0, dashed: 1, dotted: 2 } as const;

export const GRID_VERTEX = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vLocal;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vLocal = aPosition;
}`;

// The grid is the distance from each pixel to the nearest mark of its lattice, turned into
// coverage: lines a cell apart (solid), two dashes centred on every cell edge (dashed), or a marker
// with one arm per edge at every vertex (dotted). Distances are measured in map units and turned
// into device pixels with the pixel's own size, read from the derivatives, so each render draws the
// grid for its own camera: the GM's canvas, the player frame and a thumbnail alike, with nothing
// built per zoom. A line thinner than a device pixel is drawn one pixel wide and as much fainter
// (without samples such a line fell between pixel centres and vanished at some zooms); a dotted
// marker widens to a pixel too, its arms never shorter than it is thick, and keeps its ink.
//
// A hex lattice is read in the frame of a pointy-top hex at the origin (a flat-top lattice is the
// same frame with the axes swapped, which measures the same distances); the hex's symmetry folds
// every point into one quadrant, where its two sides and two vertices are all there is to measure.
export const GRID_FRAGMENT = `${GLSL_VERSION}
in vec2 vLocal;
out vec4 finalColor;

uniform vec4 uShape;
uniform vec4 uStyle;
uniform vec3 uDash;
uniform vec4 uInk;

const float SQRT3 = 1.7320508;
// The normal and the tangent of the upper-right side of a pointy-top hex.
const vec2 SIDE_NORMAL = vec2(0.5, 0.8660254);
const vec2 SIDE_TANGENT = vec2(-0.8660254, 0.5);

// Distance to the dashes of an edge, from a point 'along' from the edge's middle and 'across' from
// its line (both unsigned): the dashes have round ends, so the distance is to a capsule's spine.
float dashDistance(float along, float across) {
  float count = uDash.x;
  if (count < 0.5) return 1e9;
  float halfDash = uDash.y * 0.5;
  float fromSpine = count > 1.5 ? abs(along - (uDash.y + uDash.z) * 0.5) - halfDash : along - halfDash;
  return length(vec2(max(fromSpine, 0.0), across));
}

// Distance to a marker arm from a vertex: a box 'arm' long and 'thickness' thick, starting at the
// vertex 'from' and running along the unit vector 'dir'.
float armDistance(vec2 from, vec2 dir, float arm, float thickness, vec2 p) {
  vec2 local = p - from;
  vec2 q = abs(vec2(dot(local, dir) - arm * 0.5, dot(local, vec2(-dir.y, dir.x)))) - vec2(arm * 0.5, thickness * 0.5);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// The distance to the nearest mark of a square lattice whose lines lie 'cell' apart through the origin.
float squareDistance(vec2 q, float cell, float style, float arm, float thickness) {
  vec2 inCell = (fract(q / cell) - 0.5) * cell;
  vec2 toLine = cell * 0.5 - abs(inCell);
  if (style < 0.5) return min(toLine.x, toLine.y);
  if (style < 1.5) return min(dashDistance(abs(inCell.y), toLine.x), dashDistance(abs(inCell.x), toLine.y));
  // The nearest vertex lies toLine away on both axes; folded there, its four arms are two.
  vec2 origin = vec2(0.0);
  return min(armDistance(origin, vec2(1.0, 0.0), arm, thickness, toLine), armDistance(origin, vec2(0.0, 1.0), arm, thickness, toLine));
}

// The distance to the nearest mark of a hex lattice, 'q' measured from the centre of a pointy-top
// hex (0, 0) whose row runs along x.
float hexDistance(vec2 q, float cell, float style, float arm, float thickness) {
  float radius = cell / SQRT3;
  vec2 period = vec2(cell, 3.0 * radius);
  vec2 halfPeriod = period * 0.5;
  vec2 a = mod(q, period) - halfPeriod;
  vec2 b = mod(q - halfPeriod, period) - halfPeriod;
  vec2 folded = abs(dot(a, a) < dot(b, b) ? a : b);
  float toRight = cell * 0.5 - folded.x;
  float toSlanted = cell * 0.5 - dot(folded, SIDE_NORMAL);
  if (style < 0.5) return min(toRight, toSlanted);
  if (style < 1.5) return min(dashDistance(folded.y, toRight), dashDistance(abs(dot(folded, SIDE_TANGENT)), toSlanted));
  // The quadrant's vertices: the hex's bottom, and the right end of its right side; three arms each.
  vec2 bottom = vec2(0.0, radius);
  vec2 corner = vec2(cell * 0.5, radius * 0.5);
  float d = armDistance(bottom, vec2(0.0, 1.0), arm, thickness, folded);
  d = min(d, armDistance(bottom, vec2(SIDE_NORMAL.y, -SIDE_NORMAL.x), arm, thickness, folded));
  d = min(d, armDistance(bottom, vec2(-SIDE_NORMAL.y, -SIDE_NORMAL.x), arm, thickness, folded));
  d = min(d, armDistance(corner, vec2(0.0, -1.0), arm, thickness, folded));
  d = min(d, armDistance(corner, SIDE_TANGENT, arm, thickness, folded));
  d = min(d, armDistance(corner, vec2(SIDE_NORMAL.y, SIDE_NORMAL.x), arm, thickness, folded));
  return d;
}

void main() {
  // Map units per device pixel of this render, read before any branch.
  float px = max(length(fwidth(vLocal)) * 0.70710678, 1e-6);
  float cell = uShape.x;
  float kind = uShape.y;
  float style = uStyle.x;
  float lineWidth = uStyle.y;
  float markerArm = uStyle.z;

  // A line thinner than a pixel is drawn a pixel wide and as much fainter; a marker's arms grow with it and its ink is kept.
  float deviceWidth = lineWidth / px;
  float width = max(deviceWidth, 1.0) * px;
  float ink = min(deviceWidth, 1.0);
  float arm = markerArm;
  if (style > 1.5) {
    arm = max(markerArm, width);
    ink = (lineWidth * markerArm) / (width * arm);
  }

  vec2 q = vLocal - uShape.zw;
  float toMark;
  if (kind < 0.5) {
    toMark = squareDistance(q, cell, style, arm, width);
  } else {
    float radius = cell / SQRT3;
    q -= kind < 1.5 ? vec2(cell * 0.5, radius) : vec2(radius, cell * 0.5);
    if (kind > 1.5) q = q.yx;
    toMark = hexDistance(q, cell, style, arm, width);
  }
  // Lines and dashes are measured to their spine, markers to their edge.
  float edge = style > 1.5 ? toMark : toMark - width * 0.5;
  float coverage = clamp(0.5 - edge / px, 0.0, 1.0);
  float alpha = coverage * ink * uInk.a;
  finalColor = vec4(uInk.rgb * alpha, alpha);
}`;
