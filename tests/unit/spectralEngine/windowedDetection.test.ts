import { describe, expect, it } from 'vitest';
import type { DetectionOutcome, LineEnergy } from '../../../src/app/pixi/spectralEngine/detectionJob';
import { chooseWindows, detectGridInWindows, MAX_WINDOWS, searchedInWindows, WINDOW_SIDE, windowOutcomeOnMap } from '../../../src/app/pixi/spectralEngine/windowedDetection';
import type { DetectableMap } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { MapPixels } from '../../../src/app/pixi/spectralEngine/SpectralEngineClient';

/** Line energy over `cols` × `rows` blocks, `strong` naming the blocks (row-major index) that hold lines. */
function energy(cols: number, rows: number, strong: Record<number, number>): LineEnergy {
  const data = new Float32Array(cols * rows);
  for (const [at, value] of Object.entries(strong)) data[Number(at)] = value;
  return { cols, rows, block: 256, data };
}

describe('windows a huge map is searched in', () => {
  it('are needed only where the whole picture reduces the map by more than twice', () => {
    expect(searchedInWindows({ width: 8192, height: 4000 })).toBe(false);
    expect(searchedInWindows({ width: 8193, height: 4000 })).toBe(true);
    expect(searchedInWindows({ width: 2000, height: 31622 })).toBe(true);
  });

  it('go where the lines are, strongest first, anywhere on the map, and never twice to one place', () => {
    const size = { width: 32000, height: 32000 };
    // Lines in the bottom-right corner block (15, 15), a weaker patch top-left (0, 0), and a block beside the corner that the corner's window covers.
    const lines = energy(16, 16, { [15 * 16 + 15]: 100, [0]: 40, [15 * 16 + 14]: 90, [8 * 16 + 8]: 10 });

    const windows = chooseWindows(lines, size);

    expect(windows[0]).toEqual({ x: 32000 - WINDOW_SIDE, y: 32000 - WINDOW_SIDE, width: WINDOW_SIDE, height: WINDOW_SIDE });
    // The block beside the corner lies within that window: skipped; the faint middle block is below the share: skipped.
    expect(windows).toHaveLength(2);
    expect(windows[1]).toEqual({ x: 0, y: 0, width: WINDOW_SIDE, height: WINDOW_SIDE });
    for (const rect of windows) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
    }
  });

  it('take at most a handful, and none of a blank map', () => {
    const everywhere = energy(16, 16, Object.fromEntries([...Array(256).keys()].map((at) => [at, 50 + (at % 7)])));
    expect(chooseWindows(everywhere, { width: 40000, height: 40000 })).toHaveLength(MAX_WINDOWS);
    expect(chooseWindows(energy(16, 16, {}), { width: 40000, height: 40000 })).toEqual([]);
  });

  it('fit a map narrower than a window', () => {
    // Block (1, 1) of 4 × 16 is centred at (750, 1875): a window of 4096 rows around it starts at the top edge.
    expect(chooseWindows(energy(4, 16, { 5: 1 }), { width: 2000, height: 20000 })).toEqual([{ x: 0, y: 0, width: 2000, height: WINDOW_SIDE }]);
    expect(chooseWindows(energy(4, 16, { [4 * 15 + 2]: 1 }), { width: 2000, height: 20000 })).toEqual([{ x: 0, y: 20000 - WINDOW_SIDE, width: 2000, height: WINDOW_SIDE }]);
  });

  it('move a window\'s grid and hits onto the map, and drop a grid that turns or stretches its window', () => {
    const outcome: DetectionOutcome = { result: { gridType: 'square', cellSize: 70, offsetX: 12, offsetY: 5, confidence: 0.9 }, hits: new Float32Array([0, 0, 70, 0]) };
    const rect = { x: 1000, y: 2000, width: 4096, height: 4096 };

    expect(windowOutcomeOnMap(outcome, rect)).toEqual({ result: { ...outcome.result, offsetX: 1012, offsetY: 2005 }, hits: new Float32Array([1000, 2000, 1070, 2000]) });
    expect(windowOutcomeOnMap({ result: { ...outcome.result!, mapStretch: { x: 1.02, y: 1 } }, hits: null }, rect)).toBeNull();
    expect(windowOutcomeOnMap({ result: null, hits: null }, rect)).toBeNull();
  });

  it('search the whole map first, then each window, and take the window the lines support best', async () => {
    const size = { width: 32000, height: 32000 };
    const map: DetectableMap = {
      worldRect: { x: 0, y: 0, ...size },
      imageSize: size,
      overview: () => Promise.resolve(null),
      window: () => Promise.resolve(null),
    };
    const asked: Array<{ size: { width: number; height: number }; lines: boolean | undefined }> = [];
    const detect = (pixels: MapPixels, options: { lines?: boolean }): Promise<DetectionOutcome> => {
      const picture = pixels as { size: { width: number; height: number } };
      asked.push({ size: picture.size, lines: options.lines });
      if (options.lines) return Promise.resolve({ result: { cellSize: 9, offsetX: 1, offsetY: 1, confidence: 0.3 }, hits: null, lines: energy(16, 16, { [15 * 16 + 15]: 100, [0]: 60 }) });
      // The corner window finds the grid; the top-left one finds a weaker fit.
      const corner = asked.length === 2;
      return Promise.resolve({ result: { cellSize: 70, offsetX: corner ? 30 : 7, offsetY: 30, confidence: corner ? 0.95 : 0.5 }, hits: null });
    };

    const outcome = await detectGridInWindows(map, {}, detect);

    expect(asked.map((a) => [a.size.width, a.lines])).toEqual([[32000, true], [4096, undefined], [4096, undefined]]);
    expect(outcome.result).toEqual({ cellSize: 70, offsetX: 32000 - 4096 + 30, offsetY: 32000 - 4096 + 30, confidence: 0.95 });
  });

  it('keep the whole-map answer where no window finds a grid, and search a small map once', async () => {
    const big: DetectableMap = { worldRect: null, imageSize: { width: 32000, height: 32000 }, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    const coarse: DetectionOutcome = { result: { cellSize: 9, offsetX: 1, offsetY: 1 }, hits: null, lines: energy(16, 16, { 0: 1 }) };
    expect(await detectGridInWindows(big, {}, (_p, o) => Promise.resolve(o.lines ? coarse : { result: null, hits: null }))).toEqual({ result: coarse.result, hits: null });
    const small: DetectableMap = { worldRect: null, imageSize: { width: 4000, height: 3000 }, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    let calls = 0;
    await detectGridInWindows(small, {}, () => { calls += 1; return Promise.resolve({ result: null, hits: null }); });
    expect(calls).toBe(1);
  });
});
