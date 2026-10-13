import { describe, expect, it, vi } from 'vitest';
import { captureBeforeRender, captureWithoutLayers, captureWithLayerVisibility } from '../playerSafeFrame';

describe('captureWithoutLayers', () => {
  it('captures a frame rendered without the DM-only layers, then restores them', () => {
    const pins = { visible: true };
    const alreadyHidden = { visible: false };
    const events: string[] = [];

    captureWithoutLayers(
      [pins, alreadyHidden],
      () => events.push(`render:${pins.visible ? 'pins' : 'no-pins'}`),
      () => events.push(`capture:${pins.visible ? 'pins' : 'no-pins'}`)
    );

    expect(events).toEqual(['render:no-pins', 'capture:no-pins', 'render:pins']);
    expect(pins.visible).toBe(true);
    expect(alreadyHidden.visible).toBe(false);
  });

  it('restores the layers even when capturing throws', () => {
    const pins = { visible: true };
    expect(() => captureWithoutLayers([pins], () => undefined, () => { throw new Error('boom'); })).toThrow('boom');
    expect(pins.visible).toBe(true);
  });

  it('skips the extra renders when nothing needs hiding', () => {
    let renders = 0;
    let captures = 0;
    captureWithoutLayers([{ visible: false }], () => { renders++; }, () => { captures++; });
    expect([renders, captures]).toEqual([0, 1]);
  });
});

describe('captureWithLayerVisibility', () => {
  it('renders opaque fog for players even when no visibility flags change, then restores the DM preview', () => {
    const fog = { visible: true, alpha: 0.5 };
    const events: string[] = [];

    captureWithLayerVisibility(
      [{ layer: fog, visible: true, alpha: 1 }],
      () => events.push(`render:${fog.alpha}`),
      () => events.push(`capture:${fog.alpha}`),
    );

    expect(events).toEqual(['render:1', 'capture:1', 'render:0.5']);
    expect(fog.alpha).toBe(0.5);
  });

  it.each(['render', 'capture'])('restores fog opacity when %s fails', (failure) => {
    const fog = { visible: true, alpha: 0.5 };
    const render = vi.fn(() => {
      if (failure === 'render' && fog.alpha === 1) throw new Error('failed');
    });

    expect(() => captureWithLayerVisibility(
      [{ layer: fog, visible: true, alpha: 1 }], render, () => {
        expect(fog.alpha).toBe(1);
        if (failure === 'capture') throw new Error('failed');
      },
    )).toThrow('failed');
    expect(fog.alpha).toBe(0.5);
    expect(fog.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('can show player layers and hide DM layers, restoring both after a failed capture', () => {
    const dm = { visible: true };
    const player = { visible: false };
    const render = vi.fn();
    expect(() => captureWithLayerVisibility([
      { layer: dm, visible: false }, { layer: player, visible: true },
    ], render, () => {
      expect(dm.visible).toBe(false);
      expect(player.visible).toBe(true);
      throw new Error('capture failed');
    })).toThrow('capture failed');
    expect(dm.visible).toBe(true);
    expect(player.visible).toBe(false);
    expect(render).toHaveBeenCalledTimes(2);
  });
});

describe('captureBeforeRender', () => {
  it('captures the player frame and leaves the DM frame to the render that follows', () => {
    const pins = { visible: true };
    const fog = { visible: true, alpha: 0.5 };
    const events: string[] = [];

    captureBeforeRender(
      [{ layer: pins, visible: false }, { layer: fog, visible: true, alpha: 1 }],
      () => events.push(`render:${pins.visible ? 'pins' : 'no-pins'}:${fog.alpha}`),
      () => events.push('capture'),
    );

    expect(events).toEqual(['render:no-pins:1', 'capture']);
    expect(pins.visible).toBe(true);
    expect(fog.alpha).toBe(0.5);
  });

  it('renders even when nothing needs hiding: the canvas still holds the previous frame', () => {
    const events: string[] = [];
    captureBeforeRender([{ layer: { visible: false }, visible: false }], () => events.push('render'), () => events.push('capture'));
    expect(events).toEqual(['render', 'capture']);
  });

  it('renders from the player camera and restores the DM camera', () => {
    const point = (x: number, y: number): { x: number; y: number; set(nx: number, ny: number): void } => ({
      x, y, set(nx, ny) { this.x = nx; this.y = ny; },
    });
    const target = { position: point(5, 6), scale: point(1, 1) };
    let rendered = '';

    // Centred in the frame's own size, whatever screen the viewport has
    captureBeforeRender([], () => { rendered = `${target.position.x},${target.position.y}@${target.scale.x}`; }, () => undefined, {
      target, camera: { centerX: 100, centerY: 50, scale: 2 }, screen: { width: 1920, height: 1080 },
    });

    expect(rendered).toBe('760,440@2');
    expect([target.position.x, target.position.y, target.scale.x]).toEqual([5, 6, 1]);
  });

  it.each(['render', 'capture'])('restores the layers without a render when %s fails', (failure) => {
    const pins = { visible: true };
    const render = vi.fn(() => { if (failure === 'render') throw new Error('failed'); });

    expect(() => captureBeforeRender([{ layer: pins, visible: false }], render, () => {
      if (failure === 'capture') throw new Error('failed');
    })).toThrow('failed');

    expect(pins.visible).toBe(true);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
