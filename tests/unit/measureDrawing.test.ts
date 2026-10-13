import { describe, expect, it } from 'vitest';
import { Graphics, type Circle } from 'pixi.js';
import { drawMeasureCircle, drawMeasureCone, drawMeasurePath, drawMeasurePoint, drawMeasurement, type MeasureRecord } from '../../src/app/pixi/utils/measureDrawing';

function circleRadii(graphics: Graphics): number[] {
  return graphics.context.instructions.flatMap((instruction) =>
    instruction.action === 'texture'
      ? []
      : instruction.data.path.shapePath.shapePrimitives
        .filter(({ shape }) => shape.type === 'circle')
        .map(({ shape }) => (shape as Circle).radius),
  );
}

describe('drawMeasureCircle', () => {
  // Canvas 2D (the renderer without WebGL) throws on a negative arc radius, which stops the map from rendering.
  it('draws no negative radius before the pointer has moved', () => {
    const graphics = new Graphics();
    drawMeasureCircle(graphics, 0xff0000, { x: 10, y: 10 }, 0);
    expect(Math.min(...circleRadii(graphics))).toBeGreaterThanOrEqual(0);
  });

  it('insets the highlight ring by one pixel', () => {
    const graphics = new Graphics();
    drawMeasureCircle(graphics, 0xff0000, { x: 0, y: 0 }, 50);
    expect(circleRadii(graphics)).toEqual([50, 50, 49]);
  });
});

/** The measure tool's drawing before `drawMeasurement` took it over: the reference it must match exactly. */
function drawnAsBefore(graphics: Graphics, color: number, { shape, start, end }: MeasureRecord, coneAngle: number): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (shape === 'line') {
    drawMeasurePath(graphics, color, [start, end]);
    drawMeasurePoint(graphics, color, end);
  } else if (shape === 'cone') {
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
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(leftX, leftY);
    graphics.stroke({ width: 3, color, alpha: 0.8 });
    graphics.moveTo(start.x, start.y);
    graphics.lineTo(rightX, rightY);
    graphics.stroke({ width: 3, color, alpha: 0.8 });
    graphics.arc(start.x, start.y, distance, leftAngle, rightAngle, false);
    graphics.stroke({ width: 3, color, alpha: 0.8 });
  } else {
    drawMeasureCircle(graphics, color, start, distance);
  }
  drawMeasurePoint(graphics, color, start);
}

/** What a Graphics was told to draw: each fill or stroke with its style and the path's instructions. */
function drawn(graphics: Graphics): unknown[] {
  return graphics.context.instructions.map((instruction) =>
    instruction.action === 'texture'
      ? instruction.action
      : { action: instruction.action, style: { ...instruction.data.style, fill: undefined }, path: instruction.data.path.instructions },
  );
}

describe('drawMeasurement', () => {
  const start = { x: 105, y: 35 };
  const records: MeasureRecord[] = [
    { shape: 'line', start, end: { x: 315, y: 175 } },
    { shape: 'circle', start, end: { x: 245, y: 35 } },
    { shape: 'sphere', start, end: { x: 105, y: 245 } },
    { shape: 'cone', start, end: { x: 315, y: 175 } },
    { shape: 'cone', start, end: start },
  ];

  it.each(records)('draws a $shape exactly as the measure tool drew it before', (record) => {
    for (const coneAngle of [53, 90]) {
      const expected = new Graphics();
      drawnAsBefore(expected, 0x7f6df2, record, coneAngle);
      const actual = new Graphics();
      drawMeasurement(actual, 0x7f6df2, record, coneAngle);
      expect(drawn(actual)).toEqual(drawn(expected));
    }
  });

  it('draws a sphere as the circle of the same reach', () => {
    const circle = new Graphics();
    drawMeasurement(circle, 0xff0000, { shape: 'circle', start, end: { x: 105, y: 245 } }, 90);
    const sphere = new Graphics();
    drawMeasurement(sphere, 0xff0000, { shape: 'sphere', start, end: { x: 105, y: 245 } }, 90);
    expect(drawn(sphere)).toEqual(drawn(circle));
  });

  it('opens the cone by the angle it is given', () => {
    const narrow = new Graphics();
    drawMeasureCone(narrow, 0xff0000, start, { x: 315, y: 35 }, 60);
    const arc = narrow.context.instructions[0]!;
    expect(arc.action).toBe('fill');
    const arcCall = arc.action === 'texture' ? undefined : arc.data.path.instructions.find((step) => step.action === 'arc');
    const [, , radius, from, to] = arcCall!.data as number[];
    expect(radius).toBeCloseTo(210);
    expect(to! - from!).toBeCloseTo(Math.PI / 3);
  });
});
