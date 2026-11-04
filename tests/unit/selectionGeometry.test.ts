import { describe, expect, it } from 'vitest';
import {
  SELECTION_LOOK, boxOutline, groupFrame, highlightBox, highlightPath, openRuns, outlinePoints, roundedBoxContains, tokenOutline,
  type HighlightPath, type Point,
} from '../../src/app/pixi/selection/selectionGeometry';

const ringed = { tokenSize: 62, ringDiameter: 70, art: { width: 62, height: 62, rotation: 0 } };
const offset = SELECTION_LOOK.gap + SELECTION_LOOK.stroke / 2;
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('tokenOutline', () => {
  it('follows the ring of a ringed token', () => {
    expect(tokenOutline(ringed)).toEqual({ kind: 'circle', radius: 35 });
  });

  it('follows the art of a token shown without a ring, turned with it', () => {
    const art = { width: 62, height: 40, rotation: 0.5 };
    expect(tokenOutline({ ...ringed, ringDiameter: null, art })).toEqual({ kind: 'rect', width: 62, height: 40, rotation: 0.5, cornerRadius: 0 });
  });
});

describe('highlightPath', () => {
  it('leaves the same gap on screen at every zoom', () => {
    for (const zoom of [0.25, 1, 4]) {
      const path = highlightPath({ kind: 'circle', radius: 35 }, zoom);
      expect(path.kind === 'circle' && path.radius - 35 * zoom).toBeCloseTo(offset);
    }
  });

  it('rounds the corners of a square box and keeps an even gap on every side', () => {
    const path = highlightPath(boxOutline({ x: 0, y: 0, width: 100, height: 40 }), 2);
    expect(path).toEqual({ kind: 'rect', width: 200 + 2 * offset, height: 80 + 2 * offset, rotation: 0, radius: SELECTION_LOOK.frameRadius });
  });
});

describe('groupFrame', () => {
  const box = { x: 0, y: 0, width: 50, height: 50 };

  it('frames nothing for a single thing', () => {
    expect(groupFrame([])).toBeNull();
    expect(groupFrame([box])).toBeNull();
  });

  it('frames two or more with an even gap around all of them', () => {
    const pad = SELECTION_LOOK.groupGap + SELECTION_LOOK.groupStroke / 2;
    expect(groupFrame([box, { x: 100, y: 20, width: 40, height: 80 }])).toEqual({
      x: -pad, y: -pad, width: 140 + 2 * pad, height: 100 + 2 * pad, radius: SELECTION_LOOK.groupRadius,
    });
  });

  it('holds a turned highlight whole', () => {
    const path: HighlightPath = { kind: 'rect', width: 100, height: 20, rotation: Math.PI / 2, radius: 4 };
    const { width, height } = highlightBox(path, { x: 0, y: 0 });
    expect(width).toBeLessThan(height);
  });
});

describe('outlinePoints', () => {
  it('keeps a circle within a twentieth of a pixel of its chords, small or large', () => {
    for (const radius of [12, 300, 4000]) {
      const points = outlinePoints({ kind: 'circle', radius });
      for (let i = 0; i < points.length; i++) {
        const a = points[i]!;
        const b = points[(i + 1) % points.length]!;
        const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        expect(radius - Math.hypot(middle.x, middle.y)).toBeLessThanOrEqual(0.05 + 1e-9);
      }
    }
  });
});

describe('openRuns', () => {
  const circle = outlinePoints({ kind: 'circle', radius: 50 });

  it('leaves the line closed where no handle stands on it', () => {
    expect(openRuns(circle, [{ x: 0, y: 0, radius: 10 }])).toBeNull();
  });

  it('passes behind the handles standing on it, ending at their edge', () => {
    const handles = [{ x: 0, y: -50, radius: 10 }, { x: 50, y: 0, radius: 10 }];
    const runs = openRuns(circle, handles)!;
    expect(runs).toHaveLength(2);
    for (const run of runs) {
      const ends = [run[0]!, run[run.length - 1]!];
      for (const end of ends) expect(Math.min(...handles.map((handle) => distance(end, handle)))).toBeCloseTo(10, 6);
    }
    const covered = runs.flat().every((point) => handles.every((handle) => distance(point, handle) >= 10 - 1e-6));
    expect(covered).toBe(true);
  });
});

describe('roundedBoxContains', () => {
  const box = { x: 0, y: 0, width: 100, height: 60, radius: 12 };

  it('takes the inside and the line, and leaves out what lies past a rounded corner', () => {
    expect(roundedBoxContains(box, { x: 50, y: 30 })).toBe(true);
    expect(roundedBoxContains(box, { x: 100.4, y: 30 }, 1)).toBe(true);
    expect(roundedBoxContains(box, { x: 100.6, y: 30 }, 1)).toBe(false);
    expect(roundedBoxContains(box, { x: 1, y: 1 })).toBe(false);
    expect(roundedBoxContains(box, { x: 12, y: 1 })).toBe(true);
  });
});
