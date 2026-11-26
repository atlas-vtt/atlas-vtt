// @vitest-environment jsdom
import { Container, Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConditionBadge } from '../../src/app/pixi/token-renderer/ConditionBadge';
import { updateInstanceBadge } from '../../src/app/pixi/token-renderer/InstanceBadge';
import { computeTokenPixelSize, computeTokenStrokeWidth, tokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;
beforeEach(() => {
  restoreGraphics = stubJsdomGraphics();
});
afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
});

/** The width in the token's own units of the badge a token of `gridSize` cells draws. */
function badgeWidth(gridSize: number): number {
  const group = new Container() as TokenGroupContainer;
  group.strokeWidth = computeTokenStrokeWidth(gridSize);
  updateInstanceBadge(group, 1, computeTokenPixelSize(gridSize, 1), true);
  const badge = group.getChildByLabel('instanceBadge')!;
  const disc = badge.getChildByLabel('badgeBg') as Graphics;
  return disc.getLocalBounds().width * disc.scale.x * badge.scale.x;
}

describe('the instance badge', () => {
  it('is as large as the condition badges on the same ring', () => {
    const size = computeTokenPixelSize(70, 1);
    const condition = createConditionBadge({ color: 0x3366cc, glyph: { kind: 'text', text: 'R' } });
    const conditionWidth = condition.getLocalBounds().width * tokenUIScale(size);
    expect(badgeWidth(70)).toBeCloseTo(conditionWidth, 3);
  });

  it('keeps its proportion to the token on any grid, down to a tiny grid on a huge map', () => {
    const reference = badgeWidth(70) / computeTokenPixelSize(70, 1);
    for (const gridSize of [8, 14, 30, 150, 400]) {
      expect(badgeWidth(gridSize) / computeTokenPixelSize(gridSize, 1)).toBeCloseTo(reference, 3);
    }
  });
});
