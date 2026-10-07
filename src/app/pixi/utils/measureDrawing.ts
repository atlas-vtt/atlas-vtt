/**
 * Drawing shared by the measure tool and the token drag ruler: the accent path, its point
 * markers, the measured shapes and the distance label on a pill, with Graphics. The geometry
 * and style come from the pure `measureGeometry.ts`.
 */

import { Text, type Graphics } from 'pixi.js';
import type { Point } from '../../grid/hexGeometry';
import {
  MEASURE_AREA, MEASURE_LABEL_COLORS, MEASURE_LABEL_FONT_SIZE, MEASURE_PATH_STROKES, MEASURE_POINT, MEASURE_SHADOW, coneGeometry, measureLabelBox,
} from './measureGeometry';

/** The shapes the measure tool draws; a sphere is drawn as a circle. */
export type MeasureShape = 'line' | 'cone' | 'circle' | 'sphere';

/** A measurement as data: its shape, where it starts and where it was dragged to, in world pixels. */
export interface MeasureRecord {
  readonly shape: MeasureShape;
  readonly start: Point;
  readonly end: Point;
}

/** A polyline with a soft shadow, an accent body and a bright core. */
export function drawMeasurePath(graphics: Graphics, color: number, points: readonly Point[]): void {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) return;
  for (const stroke of MEASURE_PATH_STROKES) {
    graphics.moveTo(first.x, first.y);
    for (const point of rest) graphics.lineTo(point.x, point.y);
    graphics.stroke({ width: stroke.width, color: stroke.shadow ? MEASURE_SHADOW : color, alpha: stroke.alpha });
  }
}

/** Accent dot marking where a measurement starts, turns or ends. */
export function drawMeasurePoint(graphics: Graphics, color: number, point: Point): void {
  const { radius, halo, haloAlpha, fillAlpha, ringInset, ringWidth } = MEASURE_POINT;
  graphics.circle(point.x, point.y, radius + halo).fill({ color: MEASURE_SHADOW, alpha: haloAlpha });
  graphics.circle(point.x, point.y, radius).fill({ color, alpha: fillAlpha });
  graphics.circle(point.x, point.y, radius - ringInset).stroke({ width: ringWidth, color, alpha: 1 });
}

/** A circular area around `center`: a translucent fill, an accent outline and a bright inner ring. */
export function drawMeasureCircle(graphics: Graphics, color: number, center: Point, radius: number): void {
  const { fillAlpha, strokeWidth, strokeAlpha, highlightWidth, highlightInset } = MEASURE_AREA;
  graphics.circle(center.x, center.y, radius).fill({ color, alpha: fillAlpha });
  graphics.circle(center.x, center.y, radius).stroke({ width: strokeWidth, color, alpha: strokeAlpha });
  graphics.circle(center.x, center.y, Math.max(0, radius - highlightInset)).stroke({ width: highlightWidth, color, alpha: 1 });
}

/** A cone from `start` towards `end`, as long as the distance between them and `coneAngle` degrees wide. */
export function drawMeasureCone(graphics: Graphics, color: number, start: Point, end: Point, coneAngle: number): void {
  const { radius, startAngle, endAngle, left, right } = coneGeometry(start, end, coneAngle * Math.PI / 180);
  const outline = { width: MEASURE_AREA.strokeWidth, color, alpha: MEASURE_AREA.strokeAlpha };

  graphics.moveTo(start.x, start.y);
  graphics.lineTo(left.x, left.y);
  graphics.arc(start.x, start.y, radius, startAngle, endAngle, false);
  graphics.lineTo(start.x, start.y);
  graphics.fill({ color, alpha: MEASURE_AREA.fillAlpha });

  for (const edge of [left, right]) {
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(edge.x, edge.y);
    graphics.stroke(outline);
  }

  graphics.arc(start.x, start.y, radius, startAngle, endAngle, false);
  graphics.stroke(outline);
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
  const text = new Text({ text: '', style: { fontSize: MEASURE_LABEL_FONT_SIZE, fill: 0xffffff, fontWeight: 'normal' } });
  text.eventMode = 'none';
  text.anchor.set(0.5);
  return text;
}

/** Centres `text` on `center` and draws its theme-coloured pill into `pill`. */
export function drawMeasureLabel(pill: Graphics, text: Text, center: Point, viewportScale: number): void {
  text.position.set(center.x, center.y);
  const bounds = text.getLocalBounds();
  const box = measureLabelBox(bounds.width * text.scale.x, bounds.height * text.scale.y, center, viewportScale);
  const theme = document.body.classList.contains('theme-dark') ? MEASURE_LABEL_COLORS.dark : MEASURE_LABEL_COLORS.light;
  pill.clear();
  pill.roundRect(box.x, box.y, box.width, box.height, box.radius)
    .fill({ color: theme.fill, alpha: MEASURE_LABEL_COLORS.fillAlpha })
    .stroke({ width: box.strokeWidth, color: theme.stroke, alpha: theme.strokeAlpha });
}
