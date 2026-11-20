import { describe, expect, it } from 'vitest';
import { bannerAnchor, intoFrame } from '../../src/app/services/turnBannerAnchors';

const box = { left: 100, top: 400, right: 300, bottom: 500 };

describe('a turn banner attached to a players\' list', () => {
  it('stands on the side of the list that faces into the room, turned with a list that faces its players', () => {
    expect(bannerAnchor(box, 'bottom', true)).toEqual({ x: 200, y: 400, turn: 0, side: 'above', align: 'centre' });
    expect(bannerAnchor(box, 'top', true)).toEqual({ x: 200, y: 500, turn: 180, side: 'above', align: 'centre' });
    expect(bannerAnchor(box, 'left', true)).toEqual({ x: 300, y: 450, turn: 90, side: 'above', align: 'centre' });
    expect(bannerAnchor(box, 'right', true)).toEqual({ x: 100, y: 450, turn: -90, side: 'above', align: 'centre' });
  });

  it('stands on the inner side of a list that is not turned: below a row along the top, beside a column', () => {
    expect(bannerAnchor(box, 'top', false)).toMatchObject({ y: 500, turn: 0, side: 'below' });
    expect(bannerAnchor(box, 'bottom', false)).toMatchObject({ y: 400, turn: 0, side: 'above' });
    expect(bannerAnchor(box, 'left', false)).toEqual({ x: 300, y: 450, turn: 0, side: 'right', align: 'centre' });
    expect(bannerAnchor(box, 'right', false)).toEqual({ x: 100, y: 450, turn: 0, side: 'left', align: 'centre' });
  });
});

describe('the frame the banners stand in', () => {
  it('brings a point of the screen into overlays a table TV turns', () => {
    const screen = { left: 0, top: 0, right: 1920, bottom: 1080 };
    const round = ({ x, y }: { x: number; y: number }): [number, number] => [Math.round(x), Math.round(y)];
    expect(round(intoFrame(100, 1000, { rect: screen, width: 1920, height: 1080, turn: 0 }))).toEqual([100, 1000]);
    // Turned half way round: the screen's bottom left is the overlays' top right
    expect(round(intoFrame(100, 1000, { rect: screen, width: 1920, height: 1080, turn: 180 }))).toEqual([1820, 80]);
    // Sideways the overlays are as wide as the screen is high
    expect(round(intoFrame(1920, 540, { rect: screen, width: 1080, height: 1920, turn: 90 }))).toEqual([540, 0]);
  });
});
