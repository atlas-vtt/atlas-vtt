import { describe, expect, it, vi } from 'vitest';
import { holdTokens } from '../../src/app/lighting/sightOnDrop';
import { byteDifferences, SIZE, tableScenes } from '../helpers/tableSightScene';

const redAt = (bytes: Uint8ClampedArray, x: number, y: number): number => bytes[(y * SIZE + x) * 4]!;

describe('table sight and explored memory', () => {
  const { scene } = tableScenes();

  it('preserves every old byte and records no hidden movement, frame switch or thumbnail', async () => {
    const h = await scene();
    const before = h.memory();
    expect(redAt(before, 60, 128)).toBe(255);
    expect(redAt(before, 190, 128)).toBe(0);
    h.store.getState().updateToken('party', { isHidden: true });
    h.store.getState().moveToken('party', 190, 128);
    h.pixels('gm');
    h.pixels('player');
    h.thumbnail();
    expect(byteDifferences(before, h.memory())).toBe(0);
    h.store.getState().updateToken('party', { isHidden: false });
    const explored = h.memory();
    expect(redAt(explored, 190, 128)).toBe(255);
    let lost = 0;
    for (let i = 0; i < before.length; i++) if (before[i]! > explored[i]!) lost++;
    expect(lost).toBe(0);
    h.store.getState().updateToken('party', { isHidden: true });
    h.store.getState().moveToken('party', 220, 30);
    expect(byteDifferences(explored, h.memory())).toBe(0);
  });

  it('records a visible held source only on drop and never records a hidden drop', async () => {
    const h = await scene();
    const before = h.memory();
    holdTokens(h.store, ['party']);
    h.store.getState().moveToken('party', 190, 128);
    expect(byteDifferences(before, h.memory())).toBe(0);
    h.store.getState().updateToken('party', { isHidden: true });
    holdTokens(h.store, []);
    expect(byteDifferences(before, h.memory())).toBe(0);
    h.store.getState().updateToken('party', { isHidden: false });
    expect(redAt(h.memory(), 190, 128)).toBe(255);
  });

  it('keeps saved memory exact after decode and never carries it into a new map', async () => {
    const h = await scene();
    const before = h.memory();
    h.store.getState().updateToken('party', { isHidden: true });
    h.store.getState().moveToken('party', 190, 128);
    vi.advanceTimersByTime(2100);
    const saved = h.store.getState().exploredMask;
    expect(typeof saved).toBe('string');
    const restored = await scene({ tokens: h.store.getState().objects.tokens, mask: saved });
    await restored.settle();
    expect(byteDifferences(before, restored.memory())).toBe(0);
    h.store.getState().setMapLoading(true, 0);
    h.lighting.beforeMapUnload();
    h.store.getState().setMapPath('maps/other.atlasmap');
    h.store.getState().setExploredMask(null);
    h.store.getState().setMapLoading(false, 1);
    expect(h.memory().every((value, i) => i % 4 === 3 || value === 0)).toBe(true);
    expect(byteDifferences(before, restored.memory())).toBe(0);
  });

  it('discards an old map mask that finishes decoding after a second map has loaded', async () => {
    const h = await scene();
    const original = h.memory();
    h.store.getState().updateToken('party', { isHidden: true });
    vi.advanceTimersByTime(2100);
    const saved = h.store.getState().exploredMask;
    expect(typeof saved).toBe('string');
    expect(redAt(original, 60, 128)).toBe(255);
    const decode = HTMLImageElement.prototype.decode;
    let release = (): void => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    let finishDecode = (): void => {};
    const decoded = new Promise<void>(resolve => { finishDecode = resolve; });
    const decoding = vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementationOnce(async function (this: HTMLImageElement): Promise<void> {
      await gate;
      await decode.call(this);
      finishDecode();
    });

    h.store.getState().setMapLoading(true, 0);
    h.lighting.beforeMapUnload();
    h.store.getState().setMapPath('maps/restoring.atlasmap');
    h.store.getState().setExploredMask(saved);
    h.store.getState().setMapLoading(false, 1);
    expect(decoding).toHaveBeenCalledTimes(1);

    h.store.getState().setMapLoading(true, 0);
    h.lighting.beforeMapUnload();
    h.store.getState().setMapPath('maps/new.atlasmap');
    h.store.getState().setExploredMask(null);
    h.store.getState().moveToken('party', 190, 128);
    h.store.getState().setMapLoading(false, 1);
    const blank = h.memory();
    expect(blank.every(value => value === 0)).toBe(true);
    release();
    await decoded;
    await h.settle();
    expect(byteDifferences(blank, h.memory())).toBe(0);
    h.pixels('player');
    h.thumbnail();
    vi.advanceTimersByTime(2100);
    expect(byteDifferences(blank, h.memory())).toBe(0);
    expect(h.store.getState().exploredMask).toBeNull();
    decoding.mockRestore();
  });
});
