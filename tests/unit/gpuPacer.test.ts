import { describe, expect, it } from 'vitest';
import { GpuPacer } from '../../src/app/pixi/lighting/engine/GpuPacer';
import { TILE_BAND_TEXELS } from '../../src/app/lighting/lightingConstants';

/** The first batch: eight bands. */
const FIRST = 8 * TILE_BAND_TEXELS;
const SIGNALED = 0x9119;
const UNSIGNALED = 0x9118;

/** The few WebGL2 calls the pacer makes; `finish` lets the device run everything sent so far. */
function fakeGl(): { gl: ConstructorParameters<typeof GpuPacer>[0]; finish(): void; fences(): number } {
  const passed = new Set<object>();
  const sent: object[] = [];
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    SYNC_STATUS: 0x9114,
    SIGNALED,
    fenceSync: (): object => {
      const fence = {};
      sent.push(fence);
      return fence;
    },
    getSyncParameter: (fence: object): number => (passed.has(fence) ? SIGNALED : UNSIGNALED),
    isSync: (): boolean => true,
    deleteSync: (): void => {},
    flush: (): void => {},
  };
  return {
    gl: gl as unknown as ConstructorParameters<typeof GpuPacer>[0],
    finish: (): void => { for (const fence of sent) passed.add(fence); },
    fences: (): number => sent.length,
  };
}

/** Sends as much as the pacer allows; returns what that was. */
function batch(pacer: GpuPacer): number {
  const allowance = pacer.allowance();
  if (allowance > 0) pacer.submitted();
  return allowance;
}

describe('GpuPacer', () => {
  it('lets everything through without a WebGL2 context', () => {
    const pacer = new GpuPacer(null);
    expect(pacer.allowance()).toBe(Infinity);
    pacer.submitted();
    expect(pacer.allowance()).toBe(Infinity);
  });

  it('holds work back while three batches still run on the device', () => {
    const { gl, finish } = fakeGl();
    const pacer = new GpuPacer(gl);
    expect([batch(pacer), batch(pacer), batch(pacer)]).toEqual([FIRST, FIRST, FIRST]);
    expect(pacer.allowance()).toBe(0);
    finish();
    expect(pacer.allowance()).toBeGreaterThan(0);
  });

  it('doubles the batch once the device has run everything, and halves it while the device falls behind, never below one band', () => {
    const { gl, finish } = fakeGl();
    const pacer = new GpuPacer(gl);
    batch(pacer);
    finish();
    expect(batch(pacer)).toBe(2 * FIRST);
    finish();
    expect(batch(pacer)).toBe(4 * FIRST);
    batch(pacer);
    batch(pacer);
    // Three batches still running: the device cannot keep up with batches this large.
    expect(pacer.allowance()).toBe(0);
    expect(pacer.allowance()).toBe(0);
    finish();
    expect(batch(pacer)).toBe(2 * FIRST);
    let size = 2 * FIRST;
    while (size > TILE_BAND_TEXELS) {
      batch(pacer);
      batch(pacer);
      expect(pacer.allowance()).toBe(0);
      finish();
      size = Math.max(TILE_BAND_TEXELS, size / 2);
      expect(batch(pacer)).toBe(size);
    }
    batch(pacer);
    batch(pacer);
    expect(pacer.allowance()).toBe(0);
    finish();
    expect(batch(pacer)).toBe(TILE_BAND_TEXELS);
  });

  it('does not count work sent in the same frame as falling behind', () => {
    const { gl, finish } = fakeGl();
    const pacer = new GpuPacer(gl);
    batch(pacer);
    batch(pacer);
    finish();
    expect(batch(pacer)).toBe(2 * FIRST);
  });

  it('puts down no fence when nothing was sent', () => {
    const { gl, fences } = fakeGl();
    const pacer = new GpuPacer(gl);
    pacer.allowance();
    pacer.allowance();
    expect(fences()).toBe(0);
  });
});
