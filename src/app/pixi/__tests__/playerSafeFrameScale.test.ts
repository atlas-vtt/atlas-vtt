import { describe, it, expect } from 'vitest';
import { captureWithLayerVisibility } from '../playerSafeFrame';

describe('captureWithLayerVisibility scale', () => {
  it('scales a layer for the capture and restores it afterwards', () => {
    const scale = { x: 1, set(x: number): void { this.x = x; } };
    const layer = { visible: true, scale };
    let captured = 0;
    captureWithLayerVisibility([{ layer, visible: true, scale: 4 }], () => {}, () => { captured = scale.x; });
    expect(captured).toBe(4);
    expect(scale.x).toBe(1);
  });
});
