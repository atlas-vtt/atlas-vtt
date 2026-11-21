import { describe, expect, it } from 'vitest';
import { CANVAS_SAFE_SIDE, CANVAS_SIDE_STEPS, createCanvasLimit, nextCanvasStep, withinCanvas } from '../../../src/app/imageProcessing/canvasLimit';
import type { Size } from '../../../src/app/imageProcessing/imageLayout';

/** A device whose canvases draw up to `side` × `side` pixels, as iPadOS counts them. */
function device(side: number): { make: (size: Size) => Size | null; tried: Size[] } {
  const tried: Size[] = [];
  return {
    tried,
    make: (size) => {
      tried.push(size);
      return size.width * size.height <= side * side && Math.max(size.width, size.height) <= side ? size : null;
    },
  };
}

describe('fitting a picture within the canvas a device draws on', () => {
  it('steps from 16384 over 8192 to the side every device draws at', () => {
    expect(CANVAS_SIDE_STEPS).toEqual([16384, 8192, 4096]);
    expect(CANVAS_SAFE_SIDE).toBe(4096);
    expect([20000, 16384, 12000, 8192, 5000].map(nextCanvasStep)).toEqual([16384, 8192, 8192, 4096, 4096]);
    expect(nextCanvasStep(4096)).toBeUndefined();
  });

  it('fits within a square of the cap, keeping the aspect ratio and never scaling up', () => {
    expect(withinCanvas({ width: 12000, height: 9000 }, 4096)).toEqual({ width: 4096, height: 3072 });
    expect(withinCanvas({ width: 3000, height: 9000 }, 8192)).toEqual({ width: 2731, height: 8192 });
    expect(withinCanvas({ width: 1000, height: 800 }, 4096)).toEqual({ width: 1000, height: 800 });
    expect(withinCanvas({ width: 30000, height: 20000 }, Infinity)).toEqual({ width: 30000, height: 20000 });
  });

  it('keeps the size asked for where the device draws on it', () => {
    const limit = createCanvasLimit();
    const desktop = device(16384);
    expect(limit.largest({ width: 12000, height: 9000 }, desktop.make)).toEqual({ width: 12000, height: 9000 });
    expect(desktop.tried).toHaveLength(1);
    expect(limit.maxSide).toBe(Infinity);
  });

  it('fits a map within 8192 px on a device that draws that much (iPadOS 18)', () => {
    const limit = createCanvasLimit();
    const tablet = device(8192);
    expect(limit.largest({ width: 12000, height: 9000 }, tablet.make)).toEqual({ width: 8192, height: 6144 });
    expect(limit.maxSide).toBe(8192);
  });

  it('fits it within 4096 px on a device that draws no more (before iPadOS 18)', () => {
    const limit = createCanvasLimit();
    const tablet = device(4096);
    expect(limit.largest({ width: 12000, height: 9000 }, tablet.make)).toEqual({ width: 4096, height: 3072 });
    expect(tablet.tried).toEqual([{ width: 12000, height: 9000 }, { width: 8192, height: 6144 }, { width: 4096, height: 3072 }]);
    expect(limit.maxSide).toBe(4096);
  });

  it('starts the next picture at what it learned, and leaves a picture that fits as it is', () => {
    const limit = createCanvasLimit();
    const tablet = device(4096);
    limit.largest({ width: 12000, height: 9000 }, tablet.make);
    tablet.tried.length = 0;
    expect(limit.largest({ width: 10000, height: 10000 }, tablet.make)).toEqual({ width: 4096, height: 4096 });
    expect(limit.largest({ width: 2000, height: 1500 }, tablet.make)).toEqual({ width: 2000, height: 1500 });
    expect(tablet.tried).toEqual([{ width: 4096, height: 4096 }, { width: 2000, height: 1500 }]);
  });

  it('gives up with an error where not even the smallest step draws', () => {
    expect(() => createCanvasLimit().largest({ width: 5000, height: 5000 }, () => null)).toThrow(/drawing surface/);
  });
});
