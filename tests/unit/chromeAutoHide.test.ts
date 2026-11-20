import { describe, expect, it } from 'vitest';
import { unitIsNear } from '../../src/app/react/components/chrome-auto-hide/useChromeAutoHide';

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
const toolbar = box(400, 900, 500, 48);
const empty = box(0, 900, 0, 0);

describe('unitIsNear', () => {
  it('shows a bar within reach of the pointer and not beyond it', () => {
    expect(unitIsNear([toolbar], false, { x: 650, y: 840, pressed: false })).toBe(true);
    expect(unitIsNear([toolbar], false, { x: 650, y: 800, pressed: false })).toBe(false);
    expect(unitIsNear([toolbar], false, { x: 380, y: 920, pressed: false })).toBe(true);
  });

  it('ignores boxes without size', () => {
    expect(unitIsNear([empty], false, { x: 0, y: 900, pressed: false })).toBe(false);
  });

  it('does not bring a bar up for a drag that passes it, and keeps one a drag began at', () => {
    const pointer = { x: 650, y: 920, pressed: true };
    expect(unitIsNear([toolbar], false, pointer)).toBe(false);
    expect(unitIsNear([toolbar], true, pointer)).toBe(true);
  });
});
