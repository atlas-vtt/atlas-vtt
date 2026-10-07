/**
 * Drawing shared by the measure tool and the token drag ruler: the accent
 * path, its point markers, the measured shapes and the distance label on a pill.
 */

import { Text, type Graphics } from 'pixi.js';
import type { Point } from '../../grid/hexGeometry';

/** The shapes the measure tool draws; a sphere is drawn as a circle. */
export type MeasureShape = 'line' | 'cone' | 'circle' | 'sphere';

/** A measurement as data: its shape, where it starts and where it was dragged to, in world pixels. */
export interface MeasureRecord {
  readonly shape: MeasureShape;
  readonly start: Point;
  readonly end: Point;
}

const POINT_RADIUS = 8;
const LABEL_FONT_SIZE = 16;

/** A polyline with a soft shadow, an accent body and a bright core. */
export function drawMeasurePath(graphics: Graphics, color: number, points: readonly Point[]): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  const layers = [
    { width: 6, color: 0x000000, alpha: 0.3 },
    { width: 4, color, alpha: 0.8 },
    { width: 2, color, alpha: 1 },
  ];
  for (const stroke of layers) {
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke(stroke);
  }
}

/** The point halfway along the path's length, where its distance label goes. */
export function pathMidpoint(points: readonly Point[]): Point | null {
  const segments = points.slice(1).map((end, i) => {
    const start = points[i]!;
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
  });
  let remaining = segments.reduce((sum, segment) => sum + segment.length, 0) / 2;
  for (const { start, end, length } of segments) {
    if (length > 0 && remaining <= length) {
      const t = remaining / length;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    }
    remaining -= length;
  }
  return points[0] ?? null;
}

/** Accent dot marking where a measurement starts, turns or ends. */
export function drawMeasurePoint(graphics: Graphics, color: number, point: Point): void {
  graphics.circle(point.x, point.y, POINT_RADIUS + 3).fill({ color: 0x000000, alpha: 0.3 });
  graphics.circle(point.x, point.y, POINT_RADIUS).fill({ color, alpha: 0.9 });
  graphics.circle(point.x, point.y, POINT_RADIUS - 1).stroke({ width: 2, color, alpha: 1 });
}

/** A circular area around `center`: a translucent fill, an accent outline and a bright inner ring. */
export function drawMeasureCircle(graphics: Graphics, color: number, center: Point, radius: number): void {
  graphics.circle(center.x, center.y, radius).fill({ color, alpha: 0.1 });
  graphics.circle(center.x, center.y, radius).stroke({ width: 3, color, alpha: 0.8 });
  graphics.circle(center.x, center.y, Math.max(0, radius - 1)).stroke({ width: 1.5, color, alpha: 1 });
}

/** A cone from `start` towards `end`, as long as the distance between them and `coneAngle` degrees wide. */
export function drawMeasureCone(graphics: Graphics, color: number, start: Point, end: Point, coneAngle: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const halfAngle = coneAngle * Math.PI / 360;
  const baseAngle = Math.atan2(dy, dx);
  const leftAngle = baseAngle - halfAngle;
  const rightAngle = baseAngle + halfAngle;
  const leftX = start.x + distance * Math.cos(leftAngle);
  const leftY = start.y + distance * Math.sin(leftAngle);
  const rightX = start.x + distance * Math.cos(rightAngle);
  const rightY = start.y + distance * Math.sin(rightAngle);

  graphics.moveTo(start.x, start.y);
  graphics.lineTo(leftX, leftY);
  graphics.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
  graphics.lineTo(start.x, start.y);
  graphics.fill({ color, alpha: 0.1 });

  for (const [x, y] of [[leftX, leftY], [rightX, rightY]] as const) {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(x, y);
    graphics.stroke({ width: 3, color, alpha: 0.8 });
  }

  graphics.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
  graphics.stroke({ width: 3, color, alpha: 0.8 });
}

/**
 * Draws `measurement` in `color`: a line with a dot at its end, a circle around its start, or a
 * cone `coneAngle` degrees wide; then the dot at its start.
 */
export function drawMeasurement(graphics: Graphics, color: number, measurement: MeasureRecord, coneAngle: number): void {
  const { shape, start, end } = measurement;
  switch (shape) {
    case 'line':
      drawMeasurePath(graphics, color, [start, end]);
      drawMeasurePoint(graphics, color, end);
      break;
    case 'circle':
    case 'sphere': {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      drawMeasureCircle(graphics, color, start, Math.sqrt(dx * dx + dy * dy));
      break;
    }
    case 'cone':
      drawMeasureCone(graphics, color, start, end, coneAngle);
      break;
  }
  drawMeasurePoint(graphics, color, start);
}

export function createMeasureLabelText(): Text {
  const text = new Text({ text: '', style: { fontSize: LABEL_FONT_SIZE, fill: 0xffffff, fontWeight: 'normal' } });
  text.eventMode = 'none';
  text.anchor.set(0.5);
  return text;
}

/** Font size in world units that keeps the label readable at any zoom. */
export function measureLabelFontSize(viewportScale: number): number {
  return Math.max(12, Math.min(32, LABEL_FONT_SIZE / viewportScale));
}

/** Centres `text` on `center` and draws its theme-coloured pill into `pill`. */
export function drawMeasureLabel(pill: Graphics, text: Text, center: Point, viewportScale: number): void {
  const scaleFactor = 1 / viewportScale;
  text.position.set(center.x, center.y);

  const bounds = text.getLocalBounds();
  const padding = 8 * scaleFactor;
  const width = bounds.width * text.scale.x + padding * 2;
  const height = Math.max(20 * scaleFactor, bounds.height * text.scale.y + 4 * scaleFactor);
  const x = center.x - width / 2;
  const y = center.y - height / 2;

  const isDarkMode = document.body.classList.contains('theme-dark');
  pill.clear();
  pill.roundRect(x, y, width, height, height / 2)
    .fill({ color: isDarkMode ? 0x2a2a2a : 0xe3e3e3, alpha: 0.95 })
    .stroke({
      width: 0.5 * scaleFactor,
      color: isDarkMode ? 0xffffff : 0x000000,
      alpha: isDarkMode ? 0.4 : 0.3,
    });
}
