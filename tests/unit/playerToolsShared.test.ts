import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { cellCenterAt } from '../../src/app/grid/gridDistance';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { axialToPixel, createHexLayout, hexCircumradius } from '../../src/app/grid/hexGeometry';
import { beamWidth, laserPointSpacing } from '../../src/app/pixi/laser/laserBeamGeometry';
import { LaserTrail } from '../../src/app/pixi/laser/laserTrail';
import {
  arcPoints, CONE_ANGLE, coneGeometry, measureLabelAnchor, measureLabelBox, measureLabelFontSize, pathMidpoint,
} from '../../src/app/pixi/utils/measureGeometry';
import { DragRulerPath, dragRulerLabel, samePoint, WAYPOINT_KEY } from '../../src/app/pixi/token-renderer/dragRulerPath';
import { drawMeasurePath, drawMeasurePoint } from '../../src/app/pixi/utils/measureDrawing';
import { pathMidpoint as drawingMidpoint } from '../../src/app/pixi/utils/measureGeometry';
import { LASER_FADE_TIME } from '../../src/app/tools/laserPointerSettings';

/** Records the Graphics calls the measure drawing makes. */
function recordingGraphics(): { graphics: Graphics; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const graphics: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of ['moveTo', 'lineTo', 'stroke', 'circle', 'fill']) {
    graphics[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return graphics;
    };
  }
  return { graphics: graphics as unknown as Graphics, calls };
}

describe('measure geometry', () => {
  it('keeps the drawing module exporting the same midpoint', () => {
    expect(drawingMidpoint).toBe(pathMidpoint);
  });

  it('draws the path as shadow, body and core, and points as halo, disc and ring', () => {
    const { graphics, calls } = recordingGraphics();
    drawMeasurePath(graphics, 0x123456, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(calls.filter(([name]) => name === 'stroke')).toEqual([
      ['stroke', { width: 6, color: 0x000000, alpha: 0.3 }],
      ['stroke', { width: 4, color: 0x123456, alpha: 0.8 }],
      ['stroke', { width: 2, color: 0x123456, alpha: 1 }],
    ]);
    calls.length = 0;
    drawMeasurePoint(graphics, 0x123456, { x: 5, y: 5 });
    expect(calls).toEqual([
      ['circle', 5, 5, 11], ['fill', { color: 0x000000, alpha: 0.3 }],
      ['circle', 5, 5, 8], ['fill', { color: 0x123456, alpha: 0.9 }],
      ['circle', 5, 5, 7], ['stroke', { width: 2, color: 0x123456, alpha: 1 }],
    ]);
  });

  it('opens the cone 90 degrees around the measured direction', () => {
    const cone = coneGeometry({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(cone.radius).toBe(100);
    expect(cone.endAngle - cone.startAngle).toBeCloseTo(CONE_ANGLE);
    expect(cone.left.x).toBeCloseTo(70.71);
    expect(cone.left.y).toBeCloseTo(-70.71);
    expect(cone.right.y).toBeCloseTo(70.71);
    const arc = arcPoints({ x: 0, y: 0 }, 100, cone.startAngle, cone.endAngle, 4);
    expect(arc).toHaveLength(5);
    expect(arc[0]!.x).toBeCloseTo(cone.left.x);
    expect(arc[2]).toEqual({ x: 100, y: expect.closeTo(0) });
  });

  it('opens a cone by the given angle, 60 degrees here', () => {
    const cone = coneGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, Math.PI / 3);
    expect(cone.endAngle - cone.startAngle).toBeCloseTo(Math.PI / 3);
    expect(cone.left.x).toBeCloseTo(86.6);
    expect(cone.left.y).toBeCloseTo(-50);
    expect(cone.right.y).toBeCloseTo(50);
  });

  it('lifts the label a constant screen distance and sizes its pill for the zoom', () => {
    expect(measureLabelAnchor({ x: 0, y: 0 }, { x: 100, y: 100 }, 2)).toEqual({ x: 50, y: 35 });
    expect(measureLabelFontSize(1)).toBe(16);
    expect(measureLabelFontSize(0.1)).toBe(32);
    expect(measureLabelBox(40, 10, { x: 100, y: 100 }, 1)).toEqual({ x: 72, y: 90, width: 56, height: 20, radius: 10, strokeWidth: 0.5 });
  });
});

describe('DragRulerPath', () => {
  const snap = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: Math.floor(point.x / 70) * 70 + 35, y: Math.floor(point.y / 70) * 70 + 35,
  });
  const feet: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, diagonalRule: 'equidistant', rangeBands: [] };

  it('is empty until the token leaves its start, then runs through each waypoint once', () => {
    const path = new DragRulerPath(snap);
    path.begin({ x: 40, y: 40 });
    path.update({ x: 50, y: 50 });
    expect(path.points()).toBeNull();
    path.update({ x: 180, y: 40 });
    expect(path.points()).toEqual([{ x: 35, y: 35 }, { x: 175, y: 35 }]);
    expect(path.addWaypoint()).toBe(true);
    expect(path.addWaypoint()).toBe(false);
    path.update({ x: 180, y: 180 });
    expect(path.points()).toEqual([{ x: 35, y: 35 }, { x: 175, y: 35 }, { x: 175, y: 175 }]);
    path.end();
    expect(path.active).toBe(false);
  });

  it("labels the path with the measurement settings and uses Atlas's key", () => {
    const grid = { type: 'square' as const, size: 70, offsetX: 0, offsetY: 0 };
    expect(dragRulerLabel(grid, [{ x: 35, y: 35 }, { x: 175, y: 35 }, { x: 175, y: 175 }], feet)).toBe('20ft');
    expect(WAYPOINT_KEY).toBe(' ');
    expect(samePoint({ x: 1, y: 1 }, { x: 1.4, y: 0.6 })).toBe(true);
  });
});

describe('cellCenterAt', () => {
  it('lands in the middle of the cell holding the point, on square and hex grids', () => {
    const square = { size: 70, offsetX: 5, offsetY: 9, type: 'square' as const };
    expect(cellCenterAt(square, { x: 123, y: 99 })).toEqual({ x: 110, y: 114 });
    expect(cellCenterAt(square, { x: -40, y: 3 })).toEqual({ x: -30, y: -26 });
    expect(cellCenterAt({ size: 70 }, { x: 700, y: 701 })).toEqual({ x: 735, y: 735 });
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const grid = { size: 70, offsetX: 10, offsetY: 20, type };
      const center = axialToPixel(createHexLayout(type, 70, 10, 20), { q: 3, r: -2 });
      const near = { x: center.x + hexCircumradius(70) * 0.4, y: center.y - hexCircumradius(70) * 0.3 };
      const snapped = cellCenterAt(grid, near);
      expect(snapped.x).toBeCloseTo(center.x);
      expect(snapped.y).toBeCloseTo(center.y);
    }
  });
});

describe('the laser trail and beam width', () => {
  it("spaces points like Atlas's laser: three screen pixels, or more for a wide beam", () => {
    expect(laserPointSpacing(8, 1)).toBe(3);
    expect(laserPointSpacing(16, 2)).toBeCloseTo((beamWidth(16, 2).halfWidth) * 0.15);
  });

  it('fades every point over the fade time and drops it then', () => {
    const trail = new LaserTrail();
    trail.add(0, 0, 0);
    trail.add(10, 0, LASER_FADE_TIME / 2);
    expect(trail.beamPoints(LASER_FADE_TIME / 2)).toEqual([{ x: 0, y: 0, life: 0.5 }, { x: 10, y: 0, life: 1 }]);
    trail.prune(LASER_FADE_TIME);
    expect(trail.length).toBe(1);
    expect(trail.last()).toEqual({ x: 10, y: 0, timestamp: LASER_FADE_TIME / 2 });
    trail.prune(LASER_FADE_TIME * 2);
    expect(trail.length).toBe(0);
  });

  it('keeps at most the last hundred points', () => {
    const trail = new LaserTrail();
    for (let i = 0; i < 150; i++) trail.add(i, 0, 0);
    expect(trail.length).toBe(100);
    expect(trail.beamPoints(0)[0]!.x).toBe(50);
  });
});
