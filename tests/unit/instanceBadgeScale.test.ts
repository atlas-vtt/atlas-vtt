import { Container, Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { updateInstanceBadge } from '../../src/app/pixi/token-renderer/InstanceBadge';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../src/app/pixi/token-renderer/tokenSizing';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';

/** The width in the token's own units of the badge a token of `gridSize` cells draws. */
function badgeWidth(gridSize: number): number {
  const group = new Container() as TokenGroupContainer;
  group.strokeWidth = computeTokenStrokeWidth(gridSize);
  updateInstanceBadge(group, 1, computeTokenPixelSize(gridSize, 1), true);
  const badge = group.getChildByLabel('instanceBadge')!;
  const disc = badge.getChildByLabel('badgeBg') as Graphics;
  return disc.getLocalBounds().width * badge.scale.x;
}

describe('the instance badge', () => {
  it('keeps its proportion to the token on any grid, down to a tiny grid on a huge map', () => {
    const reference = badgeWidth(70) / computeTokenPixelSize(70, 1);
    expect(reference).toBeCloseTo(0.28, 1);
    for (const gridSize of [8, 14, 30, 150, 400]) {
      expect(badgeWidth(gridSize) / computeTokenPixelSize(gridSize, 1)).toBeCloseTo(reference, 3);
    }
  });
});
