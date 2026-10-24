import { describe, expect, it, vi } from 'vitest';
import { UNEXPLORED_IMAGE_MAX_SIDE, UnexploredImage } from '../../src/app/pixi/lighting/UnexploredImage';

describe('UnexploredImage', () => {
  it('reads nothing without a path and each path once, at the fog map size', () => {
    const read = vi.fn(() => new Promise<null>(() => undefined));
    const image = new UnexploredImage(read, () => undefined);
    expect(image.textureOf(null)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(image.textureOf('Maps/fog.png')).toBeNull();
    expect(image.textureOf('Maps/fog.png')).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith('Maps/fog.png', UNEXPLORED_IMAGE_MAX_SIDE);
  });

  it('makes no texture of a file that is gone, and reports nothing ready', async () => {
    const ready = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const image = new UnexploredImage(() => Promise.resolve(null), ready);
    image.textureOf('Maps/gone.png');
    await Promise.resolve();
    await Promise.resolve();
    expect(image.textureOf('Maps/gone.png')).toBeNull();
    expect(ready).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('drops a read that finishes after its path was replaced', async () => {
    let finish: (value: null) => void = () => undefined;
    const ready = vi.fn();
    const image = new UnexploredImage(() => new Promise((resolve) => { finish = resolve; }), ready);
    image.textureOf('Maps/old.png');
    const late = finish;
    image.textureOf(null);
    late(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
  });
});
