import { rectPoly, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import { roundedRect } from '../../glyphPen';

export interface Panel { x: number; y: number; w: number; h: number }

export const PLINTH: Panel = { x: 0, y: 0, w: 0.25, h: 0.25 };

export function panelPath(b: Panel): PathFn {
  return path => roundedRect(path, b.x, b.y, b.w, b.h, 0.008);
}

export function panelPoly(b: Panel): Vec[] {
  return rectPoly({ x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h });
}

/** Draped shoulders viewed from above: the crown overlaps the neck, never a face. */
export function shoulders(path: CanvasPath): void {
  path.moveTo(-0.115, 0.025);
  path.quadraticCurveTo(-0.12, -0.052, -0.065, -0.064);
  path.quadraticCurveTo(0, -0.084, 0.065, -0.064);
  path.quadraticCurveTo(0.12, -0.052, 0.115, 0.025);
  path.quadraticCurveTo(0.064, 0.076, 0, 0.06);
  path.quadraticCurveTo(-0.064, 0.076, -0.115, 0.025);
  path.closePath();
}
