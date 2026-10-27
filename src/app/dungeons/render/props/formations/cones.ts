import { glyphEdges, glyphTone, lightInGlyph } from '../../art/glyphLight';
import { pathBounds, polyPath, polysPath, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import { calcite, fineRuns, type Finish } from './finish';
import { closed, type Mound } from './shapes';

/**
 * Cones of calcite seen from straight above: the flank turned from the light falls into shade from
 * the tip outwards, so a stalagmite rises to its point and a column stands round. Stone shades with
 * nested wedges, drawn as geometry and cheap; Engraved hatches a field that deepens away from the light.
 */

export interface Cone {
  foot: readonly Vec[];
  apex: Vec;
  reach: number;
}

/** The arc of a cone's foot whose direction from its apex lies towards `dir` by more than `threshold`, closed through the apex: one of its flanks. */
function flank(cone: Cone, dir: Vec, threshold: number): Vec[] {
  const { foot, apex } = cone;
  const away = foot.map(p => {
    const d = Math.hypot(p.x - apex.x, p.y - apex.y) || 1;
    return ((p.x - apex.x) * dir.x + (p.y - apex.y) * dir.y) / d > threshold;
  });
  const start = away.findIndex(a => !a);
  if (start < 0) return [...foot];
  const arc: Vec[] = [];
  for (let k = 1; k <= foot.length; k++) {
    const i = (start + k) % foot.length;
    if (away[i]) arc.push(foot[i]!);
    else if (arc.length) break;
  }
  return arc.length > 1 ? [apex, ...arc] : [];
}

/**
 * Models every cone in `cones`: Stone lightens the flank towards the light and shades the far one
 * as wedges from the apex; Engraved hatches a field deepening away from the light.
 */
function shadeCones(pen: GlyphPen, cones: readonly Cone[], finish: Finish): void {
  const light = lightInGlyph(pen);
  if (finish.painter === 'stone') {
    const wedges = (dir: Vec, threshold: number): PathFn => polysPath(cones.map(c => flank(c, dir, threshold)).filter(w => w.length > 2));
    finish.lit(pen, wedges(light, 0.3), 0.7);
    finish.shaded(pen, wedges({ x: -light.x, y: -light.y }, 0.15), 0.55);
    return;
  }
  for (const { foot, apex, reach } of cones) {
    const path = polyPath(foot);
    const bounds = pathBounds(path);
    if (!bounds) continue;
    glyphTone(pen, (x, y) => {
      const dx = x - apex.x;
      const dy = y - apex.y;
      const d = Math.hypot(dx, dy);
      if (d < 1e-6) return 0;
      const away = -(dx * light.x + dy * light.y) / d;
      return 0.5 * Math.max(0, away + 0.15) ** 0.9 * Math.min(1, d / (reach * 0.45));
    }, bounds, path, 'shade');
  }
}

/** A short arc of `r` round `c`, centred on the light's side: where wet calcite glints. */
export function glint(pen: GlyphPen, c: Vec, r: number, spread: number): Vec[] {
  const light = lightInGlyph(pen);
  const a0 = Math.atan2(light.y, light.x);
  return Array.from({ length: 6 }, (_, k) => {
    const a = a0 + (k / 5 - 0.5) * spread;
    return { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
  });
}

/** One rounded part of a clump: its cone, the fine lines on it and where it glints. */
export interface ClumpPart {
  cone: Cone;
  lines: Vec[][];
  glints: Vec[][];
}

/** A stalagmite as a part of its clump: rings of growth climbing to its tip; a great one's splash cup in its tip, and where it glints. */
export function moundPart(pen: GlyphPen, m: Mound): ClumpPart {
  const great = m.r >= 0.12;
  return {
    cone: { foot: m.foot, apex: m.tip, reach: m.r },
    lines: [...m.rings.slice(0, m.r < 0.1 ? 1 : 2).map(closed), ...(great ? [closed(glint(pen, m.tip, m.r * 0.09, Math.PI * 2))] : [])],
    glints: great ? [glint(pen, m.tip, m.r * 0.32, 1.4), glint(pen, m.tip, m.r * 0.62, 0.8)] : [],
  };
}

/**
 * Rounded calcite parts that do not overlap, drawn together: every foot, every lit and shaded flank,
 * every fine line, glint and outline is one path for the whole clump. Engraved gives its shade
 * line to any part large enough to carry it; on a smaller one it would swallow the part.
 */
export function drawClump(pen: GlyphPen, parts: readonly ClumpPart[], finish: Finish): void {
  const { ctx } = pen;
  ctx.beginPath();
  polysPath(parts.map(p => p.cone.foot))(ctx);
  ctx.fillStyle = calcite(pen);
  ctx.fill();
  shadeCones(pen, parts.map(p => p.cone), finish);
  fineRuns(pen, parts.flatMap(p => p.lines), 0.7);
  finish.sheen(pen, parts.flatMap(p => p.glints));
  const edged = (p: ClumpPart): boolean => finish.painter === 'engraved' && p.cone.reach >= 0.1;
  pen.hand.line(parts.filter(p => !edged(p)).map(p => [...p.cone.foot]), 'outline', true);
  for (const p of parts.filter(edged)) glyphEdges(pen, p.cone.foot, true);
}
