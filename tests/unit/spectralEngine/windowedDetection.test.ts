import { describe, expect, it } from 'vitest';
import type { DetectionOutcome, LineEnergy } from '../../../src/app/pixi/spectralEngine/detectionJob';
import { chooseWindows, detectGridInWindows, MAX_WINDOWS, searchedInWindows, WINDOW_SIDE, windowOutcomeOnMap, windowsAnswer } from '../../../src/app/pixi/spectralEngine/windowedDetection';
import type { DetectableMap } from '../../../src/app/pixi/spectralEngine/detectGrid';
import type { DetectOptions, MapPixels } from '../../../src/app/pixi/spectralEngine/SpectralEngineClient';

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

  it('read where the lines lie first, then search the whole map and every window at once, and take the window the lines support best', async () => {
    const size = { width: 32000, height: 32000 };
    const map: DetectableMap = {
      worldRect: { x: 0, y: 0, ...size },
      imageSize: size,
      overview: () => Promise.resolve(null),
      window: () => Promise.resolve(null),
    };
    const asked: Array<{ size: { width: number; height: number }; linesOnly: boolean | undefined }> = [];
    const pending: Array<() => void> = [];
    const detect = (pixels: MapPixels, options: DetectOptions): Promise<DetectionOutcome> => {
      const picture = pixels as { size: { width: number; height: number } };
      asked.push({ size: picture.size, linesOnly: options.linesOnly });
      if (options.linesOnly) return Promise.resolve({ result: null, hits: null, lines: energy(16, 16, { [15 * 16 + 15]: 100, [0]: 60 }) });
      if (picture.size.width === size.width) return new Promise((resolve) => pending.push(() => resolve({ result: { cellSize: 70.4, offsetX: 1, offsetY: 1, confidence: 0.3 }, hits: null })));
      // The corner window finds the grid; the top-left one finds a weaker fit.
      const corner = asked.length === 3;
      return new Promise((resolve) => pending.push(() => resolve({ result: { cellSize: 70, offsetX: corner ? 30 : 7, offsetY: 30, confidence: corner ? 0.95 : 0.5 }, hits: null })));
    };

    const detection = detectGridInWindows(map, {}, detect);
    await settled();

    // Nothing has answered but the lines, and every search is under way.
    expect(asked.map((a) => [a.size.width, a.linesOnly])).toEqual([[32000, true], [32000, undefined], [4096, undefined], [4096, undefined]]);
    for (const answer of pending) answer();
    expect((await detection).result).toEqual({ cellSize: 70, offsetX: 32000 - 4096 + 30, offsetY: 32000 - 4096 + 30, confidence: 0.95 });
  });

  it('take the same window whichever order the searches answer in', async () => {
    const size = { width: 40000, height: 40000 };
    const map: DetectableMap = { worldRect: null, imageSize: size, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    // Six blocks far apart: six windows.
    const lines = energy(16, 16, { 0: 100, 7: 99, 15: 98, [8 * 16]: 97, [8 * 16 + 8]: 96, [15 * 16 + 15]: 95 });
    // Per window in the order they are chosen: ties at 0.9 (the first of them wins), no grid, and a stretched grid that does not count.
    const found: Array<DetectionOutcome> = [
      { result: { cellSize: 70, offsetX: 1, offsetY: 0, confidence: 0.5 }, hits: null },
      { result: { cellSize: 70, offsetX: 2, offsetY: 0, confidence: 0.9 }, hits: null },
      { result: null, hits: null },
      { result: { cellSize: 70, offsetX: 4, offsetY: 0, confidence: 0.9 }, hits: null },
      { result: { cellSize: 70, offsetX: 5, offsetY: 0, confidence: 0.99, mapStretch: { x: 1.02, y: 1 } }, hits: null },
      { result: { cellSize: 70, offsetX: 6, offsetY: 0, confidence: 0.9 }, hits: null },
    ];
    const whole: DetectionOutcome = { result: { cellSize: 70.3, offsetX: 0, offsetY: 0, confidence: 0.2 }, hits: null };

    /** Runs the detection with its searches answering in `order` (0 the whole map, 1 to 6 the windows). */
    async function answeredIn(order: number[]): Promise<DetectionOutcome> {
      const answers: Array<() => void> = [];
      let searches = 0;
      const detection = detectGridInWindows(map, {}, (_pixels, options) => {
        if (options.linesOnly) return Promise.resolve({ result: null, hits: null, lines });
        const at = searches++;
        return new Promise((resolve) => answers[at] = () => resolve(at === 0 ? whole : found[at - 1]!));
      });
      await settled();
      for (const at of order) {
        answers[at]!();
        await settled();
      }
      return detection;
    }

    const inTurn = await answeredIn([0, 1, 2, 3, 4, 5, 6]);
    expect(inTurn.result?.offsetX).toBe(2 + chooseWindows(lines, size)[1]!.x);
    let seed = 7;
    const random = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let round = 0; round < 24; round++) {
      const order = [0, 1, 2, 3, 4, 5, 6].map((at) => ({ at, key: random() })).sort((a, b) => a.key - b.key).map(({ at }) => at);
      expect(await answeredIn(order), order.join()).toEqual(inTurn);
    }
  });

  it('make the whole map\'s grid precise, and never trade it for another grid one part of the map holds better', () => {
    const whole: DetectionOutcome = { result: { gridType: 'square', cellSize: 200.01, offsetX: 99.5, offsetY: 99.5, confidence: 0.11 }, hits: null };
    const square = (cellSize: number, confidence: number): DetectionOutcome => ({ result: { gridType: 'square', cellSize, offsetX: 3, offsetY: 4, confidence }, hits: null });

    // A dungeon's windows held lattices of 160 and 100 px better than its 200 px grid, drawn on the floors alone.
    expect(windowsAnswer(whole, [square(160, 0.27), square(100, 0.16), null])).toBe(whole);
    const precise = square(200, 0.15);
    expect(windowsAnswer(whole, [square(160, 0.27), precise, square(199.99, 0.12)])).toBe(precise);
    // Hexes of the whole map's size are another grid.
    expect(windowsAnswer(whole, [{ result: { ...precise.result!, gridType: 'hex-vertical' }, hits: null }])).toBe(whole);
  });

  it('take the window the lines support best where the whole map found no grid', () => {
    const square = (cellSize: number, confidence: number): DetectionOutcome => ({ result: { gridType: 'square', cellSize, offsetX: 3, offsetY: 4, confidence }, hits: null });
    const best = square(70, 0.6);

    expect(windowsAnswer({ result: null, hits: null }, [square(175, 0.4), null, best, square(70, 0.6)])).toBe(best);
  });

  it('keep the whole-map answer where no window finds a grid, and search a small map once', async () => {
    const big: DetectableMap = { worldRect: null, imageSize: { width: 32000, height: 32000 }, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    const coarse: DetectionOutcome = { result: { cellSize: 9, offsetX: 1, offsetY: 1 }, hits: null };
    const lines = energy(16, 16, { 0: 1 });
    expect(await detectGridInWindows(big, {}, (pixels, o) => Promise.resolve(o.linesOnly ? { result: null, hits: null, lines } : pixels.size.width === 32000 ? coarse : { result: null, hits: null }))).toEqual(coarse);
    const small: DetectableMap = { worldRect: null, imageSize: { width: 4000, height: 3000 }, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    let calls = 0;
    await detectGridInWindows(small, {}, () => { calls += 1; return Promise.resolve({ result: null, hits: null }); });
    expect(calls).toBe(1);
  });

  it('find no grid where the map\'s picture cannot be read', async () => {
    const big: DetectableMap = { worldRect: null, imageSize: { width: 32000, height: 32000 }, overview: () => Promise.resolve(null), window: () => Promise.resolve(null) };
    let calls = 0;
    expect(await detectGridInWindows(big, {}, () => { calls += 1; return Promise.resolve({ result: null, hits: null }); })).toEqual({ result: null, hits: null });
    expect(calls).toBe(1);
  });
});

/** Lets every answered promise run on. */
async function settled(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
