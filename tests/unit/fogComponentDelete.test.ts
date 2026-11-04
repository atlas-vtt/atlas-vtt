import { describe, expect, it } from 'vitest';
import { extractConnectedComponentRects, fogWithErasers } from '../../src/app/pixi/fog/fogComponentDelete';
import type { FogOperation } from '../../src/app/types/fogTypes';

function buildMask(width: number, height: number, on: Array<{ x: number; y: number }>): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const p of on) {
    mask[p.y * width + p.x] = 1;
  }
  return mask;
}

describe('extractConnectedComponentRects', () => {
  it('returns only the clicked connected component when two blobs are separated', () => {
    const on: Array<{ x: number; y: number }> = [];
    for (let y = 1; y <= 4; y++) {
      for (let x = 1; x <= 3; x++) on.push({ x, y });
      for (let x = 6; x <= 8; x++) on.push({ x, y });
    }
    const mask = buildMask(10, 6, on);
    const rects = extractConnectedComponentRects(mask, 10, 6, 2, 2);

    expect(rects).toEqual([{ x: 1, y: 1, width: 3, height: 4 }]);
  });

  it('returns empty when seed pixel is not part of fog', () => {
    const mask = buildMask(6, 4, [{ x: 1, y: 1 }, { x: 2, y: 1 }]);
    expect(extractConnectedComponentRects(mask, 6, 4, 5, 3)).toEqual([]);
  });
});


describe('erasing a connected region of fog', () => {
  const fog = (id: string, level?: string): FogOperation => ({ id, kind: 'fog', timestamp: 1, type: 'rectangle', isErasing: false, x: 0, y: 0, width: 10, height: 10, ...(level && { level }) });

  it('adds the erasers on the floor shown and keeps every floor\'s fog', () => {
    const next = fogWithErasers({ low: fog('low'), high: fog('high', 'upper') }, [{ x: 1, y: 2, width: 3, height: 4 }, { x: 0, y: 0, width: 0, height: 5 }], 100, { level: 'upper' });

    expect(Object.keys(next ?? {})).toHaveLength(3);
    const erasers = Object.values(next ?? {}).filter((operation) => operation.isErasing);
    expect(erasers).toEqual([expect.objectContaining({ type: 'rectangle', x: 1, y: 2, width: 3, height: 4, level: 'upper', timestamp: 100 })]);
  });

  it('changes nothing where no rectangle has an area', () => {
    expect(fogWithErasers({}, [{ x: 0, y: 0, width: 0, height: 0 }], 100, {})).toBeNull();
  });
});
