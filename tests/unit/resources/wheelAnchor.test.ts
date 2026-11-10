import { describe, expect, it } from 'vitest';
import { wheelAnchor, type WheelAnchorInput } from '../../../src/app/pixi/token-renderer/resources/wheelAnchor';
import { wheelSlot } from '../../../src/app/pixi/token-renderer/resources/wheelGeometry';
import { BAR_BUTTON_SIZE } from '../../../src/app/pixi/token-renderer/resources/ResourceStack';
import { getTokenRingCenterRadius } from '../../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, NAMEPLATE_HEIGHT, RESIZE_HANDLE_SIZE, selectedTokenUIScale, tokenUIScale } from '../../../src/app/pixi/token-renderer/tokenSizing';
import { barDimensions } from '../../../src/app/styles/designTokens';

interface Box { left: number; top: number; right: number; bottom: number }

const GRID = 70;
const { width: BAR_WIDTH, height: BAR_HEIGHT, gap: BAR_GAP } = barDimensions.token;
const overlaps = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const square = (x: number, y: number, radius: number): Box => ({ left: x - radius, top: y - radius, right: x + radius, bottom: y + radius });

/** Everything of a token's UI the wheels must not cover (the bars' buttons only while shown, room 1), in world units from its centre, laid out as the token UI draws it. */
function obstacles(input: WheelAnchorInput, bars: number): Box[] {
  const { spriteSize, uiScale: s, barButtons, nameplateHalfWidth } = input;
  const bottom = spriteSize / 2;
  const ring = getTokenRingCenterRadius(spriteSize, 4, 1);
  const handle = (RESIZE_HANDLE_SIZE / 2) * tokenUIScale(spriteSize);
  const boxes = [square(ring, 0, handle), square(-ring, 0, handle), square(0, -ring, handle),
    { left: -nameplateHalfWidth * s, right: nameplateHalfWidth * s, top: bottom - NAMEPLATE_HEIGHT * s, bottom }];
  for (let bar = 0; bar < bars; bar++) {
    const top = bottom + (2 + bar * (BAR_HEIGHT + BAR_GAP)) * s;
    boxes.push({ left: (-BAR_WIDTH / 2) * s, right: (BAR_WIDTH / 2) * s, top, bottom: top + BAR_HEIGHT * s });
    if (barButtons === 1) {
      const buttonX = (BAR_WIDTH / 2 + BAR_GAP + BAR_BUTTON_SIZE / 2) * s;
      for (const x of [buttonX, -buttonX]) boxes.push(square(x, top + (BAR_HEIGHT / 2) * s, (BAR_BUTTON_SIZE / 2) * s));
    }
  }
  return boxes;
}

/** The four wheels, in world units from the token's centre. */
function wheels(input: WheelAnchorInput): Box[] {
  const anchor = wheelAnchor(input);
  return [2, 3, 4, 5].map((slot) => {
    const { kind, left, top, width, height } = wheelSlot(`w${slot}`, slot);
    const x = kind === 'wheel-left' ? -anchor.x : anchor.x;
    const s = input.uiScale;
    return { left: x + left * s, right: x + (left + width) * s, top: anchor.y + top * s, bottom: anchor.y + (top + height) * s };
  });
}

const barsBottomOf = (bars: number): number => (bars === 0 ? 0 : 2 + bars * BAR_HEIGHT + (bars - 1) * BAR_GAP);

function input(bars: number, uiScale: number, overrides: Partial<WheelAnchorInput> = {}): WheelAnchorInput {
  return { spriteSize: computeTokenPixelSize(GRID, 1), gridSize: GRID, ringScale: 1, uiScale, barsBottom: barsBottomOf(bars),
    barButtons: uiScale > 1 ? 1 : 0, nameplateHalfWidth: 20, ...overrides };
}

describe('wheelAnchor', () => {
  // Resting, and a selected token's UI at zooms where it grows past its resting size
  const scales = [1, ...[2.25, 1.5, 1, 0.6, 0.3].map((zoom) => selectedTokenUIScale(1, zoom))];

  it.each(scales.flatMap((scale) => [0, 1, 2].map((bars) => [scale, bars])))('covers nothing of the token UI at scale %s with %s bars', (scale, bars) => {
    for (const nameplateHalfWidth of [0, 20, 48]) {
      for (const barButtons of [0, 0.5, 1]) {
        const layout = input(bars, scale, { nameplateHalfWidth, barButtons });
        const covered = obstacles(layout, bars);
        for (const wheel of wheels(layout)) expect(covered.some((box) => overlaps(wheel, box))).toBe(false);
      }
    }
  });

  it.each([0, 1, 2])('centres both columns on the token and its %s bars', (bars) => {
    for (const scale of scales) {
      const layout = input(bars, scale);
      const top = -layout.spriteSize / 2;
      const bottom = layout.spriteSize / 2 + layout.barsBottom * scale;
      const [upperRight, lowerRight, upperLeft, lowerLeft] = wheels(layout);
      expect((upperRight!.top + lowerRight!.bottom) / 2).toBeCloseTo((top + bottom) / 2);
      // The left column is the right one's mirror
      expect([upperLeft!.top, lowerLeft!.top]).toEqual([upperRight!.top, lowerRight!.top]);
      expect(upperLeft!.right).toBeCloseTo(-upperRight!.left);
    }
  });

  it('frames a selected token with two bars: the column is as tall as the token and its bars', () => {
    const layout = input(2, selectedTokenUIScale(1, 0.6));
    const [upper, lower] = wheels(layout);
    const groupHeight = layout.spriteSize + layout.barsBottom * layout.uiScale;
    expect((lower!.bottom - upper!.top) / groupHeight).toBeGreaterThan(0.9);
    expect((lower!.bottom - upper!.top) / groupHeight).toBeLessThan(1.15);
  });

  it('stands just past the resize button at rest, as before', () => {
    const layout = input(2, 1);
    const ring = getTokenRingCenterRadius(layout.spriteSize, 4, 1);
    expect(wheelAnchor(layout).x).toBeCloseTo(ring + RESIZE_HANDLE_SIZE / 2);
  });

  it('moves out with the bars\' buttons as the token is selected and with a long nameplate', () => {
    const scale = selectedTokenUIScale(1, 1);
    const resting = wheelAnchor(input(2, scale, { barButtons: 0 })).x;
    const selected = wheelAnchor(input(2, scale)).x;
    expect(selected).toBeCloseTo(resting + (BAR_GAP + BAR_BUTTON_SIZE) * scale);
    expect(wheelAnchor(input(2, scale, { nameplateHalfWidth: 80 })).x).toBeCloseTo(80 * scale);
  });

  it('stays clear of the resize button on a large token, which scales with the token', () => {
    for (const size of [1.5, 2.5]) {
      const layout = input(2, selectedTokenUIScale(1, 1), { spriteSize: computeTokenPixelSize(GRID, size) });
      const covered = obstacles(layout, 2);
      for (const wheel of wheels(layout)) expect(covered.some((box) => overlaps(wheel, box))).toBe(false);
    }
  });
});
