import { describe, expect, it } from 'vitest';
import { windowControlsClearance } from '../../src/app/react/components/useClearOfWindowControls';

const box = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

describe('windowControlsClearance', () => {
  const widgets = box(600, 8, 500, 100);

  it('moves the widgets left of buttons that lie over them, with a gap', () => {
    expect(windowControlsClearance(widgets, box(960, 0, 140, 40))).toBe(1100 - 960 + 8);
  });

  it('leaves the widgets where no buttons are, or where the buttons lie elsewhere', () => {
    expect(windowControlsClearance(widgets, undefined)).toBe(0);
    expect(windowControlsClearance(widgets, box(0, 0, 0, 0))).toBe(0);
    expect(windowControlsClearance(widgets, box(1200, 0, 140, 40))).toBe(0);
    expect(windowControlsClearance(widgets, box(960, 200, 140, 40))).toBe(0);
  });
});
