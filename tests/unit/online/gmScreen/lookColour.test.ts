import { describe, expect, it } from 'vitest';
import { travellingColour } from '../../../../src/app/online/gmScreen/look/lookColour.ts';
import { LOOK_COLOUR_VALUE } from '../../../../src/app/online/protocol/index.ts';

describe('a colour the browser resolved, in the form it travels in', () => {
  it('writes the legacy forms a browser computes as hex, with alpha only where it is not opaque', () => {
    expect(travellingColour('rgb(245, 237, 220)')).toBe('#f5eddc');
    expect(travellingColour('rgba(42, 30, 14, 0.08)')).toBe('#2a1e0e14');
    expect(travellingColour('rgba(0, 0, 0, 0)')).toBe('#00000000');
    expect(travellingColour('rgba(1, 2, 3, 1)')).toBe('#010203');
  });

  it('writes a colour of the sRGB space, as a mix computes, as hex', () => {
    expect(travellingColour('color(srgb 0.960784 0.929412 0.862745)')).toBe('#f5eddc');
    expect(travellingColour('color(srgb 0.164706 0.117647 0.054902 / 0.08)')).toBe('#2a1e0e14');
    expect(travellingColour('color(srgb 1 0.5 0 / 0.5)')).toBe('#ff800080');
  });

  it('clamps a colour beyond sRGB to its edge', () => {
    expect(travellingColour('color(srgb 1.2 -0.1 0.5)')).toBe('#ff0080');
  });

  it('is nothing for what it cannot read, so the colour stays out', () => {
    for (const text of ['', 'red', 'oklch(0.5 0.1 30)', 'color(display-p3 1 0 0)', 'rgb(1, 2)', 'color(srgb none 0 0)', 'rgb(1, 2, 3); background: red']) expect(travellingColour(text)).toBeNull();
  });

  it('always comes out in the form a device takes', () => {
    for (const text of ['rgb(0, 0, 0)', 'rgba(255, 255, 255, 0.333)', 'color(srgb 0.1 0.2 0.3 / 0.999)']) expect(travellingColour(text)).toMatch(LOOK_COLOUR_VALUE);
  });
});
