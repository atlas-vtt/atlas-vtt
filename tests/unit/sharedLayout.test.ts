import { describe, expect, it } from 'vitest';
import { SCENE_LAYER_ORDER, SCENE_LAYER_Z } from '../../src/app/pixi/sceneLayerOrder';
import { MAP_LAYER_Z } from '../../src/app/pixi/mapLayerOrder';
import { DEFAULT_TEXT_PADDING, textBackground, textFontStyle, textFontWeight, textRotation, textScale } from '../../src/app/pixi/textBoxLayout';
import { badgePositions, badgeSlots, CONDITION_BADGE, fitBadges } from '../../src/app/pixi/token-renderer/conditionBadgeLayout';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth, restingTokenUIScale } from '../../src/app/pixi/token-renderer/tokenSizing';
import { readFileSync } from 'node:fs';
import { DOWNED_LOOK } from '../../src/app/pixi/token-renderer/downedLook';
import { BAR_LOOK } from '../../src/app/pixi/token-renderer/resources/ResourceBarView';
import {
  BAR_BORDER, BAR_FILL_INSET, BAR_STYLE, BAR_TICKS, FIRST_BAR_GAP, barFillRect, barInnerRect, barStackRects, barTickXs, nameplateRect,
} from '../../src/app/pixi/token-renderer/tokenUiLayout';

describe('scene layer order', () => {
  it('stacks map and grid at the bottom, then the zIndex layers in ascending order', () => {
    expect(SCENE_LAYER_ORDER).toEqual(['map', 'grid', 'tokens', 'texts', 'drawings', 'fog']);
    const zLayers = SCENE_LAYER_ORDER.filter((layer): layer is keyof typeof SCENE_LAYER_Z => layer in SCENE_LAYER_Z);
    expect(zLayers).toEqual(['tokens', 'texts', 'drawings', 'fog']);
    const z = zLayers.map((layer) => SCENE_LAYER_Z[layer]);
    expect(z).toEqual([...z].sort((a, b) => a - b));
  });

  it("places texts where Atlas's own map layers put them, so extensions draw them in the same order", () => {
    expect(SCENE_LAYER_Z.texts).toBe(MAP_LAYER_Z.text);
  });
});

describe('token UI layout', () => {
  it('stacks the bars below the token, the first two units under its edge and a gap between them', () => {
    expect(barStackRects(0)).toEqual([]);
    expect(barStackRects(1)).toEqual([{ x: -32, y: 2, width: 64, height: 10 }]);
    expect(barStackRects(2)[1]).toEqual({ x: -32, y: 14, width: 64, height: 10 });
  });

  it('insets the dark inside by half the border and the fill by one unit', () => {
    const inner = barInnerRect({ x: -32, y: 2, width: 64, height: 10 });
    expect(inner).toEqual({ x: -31.625, y: 2.375, width: 63.25, height: 9.25 });
    expect(barFillRect(inner)).toEqual({ x: -30.625, y: 3.375, width: 61.25, height: 7.25 });
    expect(barTickXs(inner)).toHaveLength(9);
    expect(barTickXs(inner)[0]).toBeCloseTo(-31.625 + 6.325);
  });

  it('sizes the nameplate to its text, at least 40 units wide, its bottom on the token edge', () => {
    expect(nameplateRect(48)).toEqual({ x: -20, y: -14, width: 40, height: 14, textY: -7 });
    expect(nameplateRect(300).width).toBeCloseTo(300 * 0.333 + 12);
  });
});

describe('condition badge layout', () => {
  const ringRadius = getTokenRingCenterRadius(computeTokenPixelSize(70, 1), computeTokenStrokeWidth(70), 1);
  const scale = restingTokenUIScale(70);

  it('fits three badges on a medium token, the last slot counting the rest', () => {
    expect(badgeSlots(ringRadius, scale)).toBe(3);
    expect(fitBadges(['a', 'b', 'c'], ringRadius, scale)).toEqual({ shown: ['a', 'b', 'c'], overflow: 0 });
    expect(fitBadges(['a', 'b', 'c', 'd', 'e'], ringRadius, scale)).toEqual({ shown: ['a', 'b'], overflow: 3 });
  });

  it('fans badges out around the upper left, the first nearest the top', () => {
    const [first, second] = badgePositions(2, ringRadius, scale);
    expect(Math.hypot(first!.x, first!.y)).toBeCloseTo(ringRadius);
    expect(first!.x).toBeLessThan(0);
    expect(first!.y).toBeLessThan(second!.y);
    expect(CONDITION_BADGE.radius).toBe(6);
  });
});

describe('text box layout', () => {
  it('grows a background by its padding, 8 when unset, at the text opacity', () => {
    const bounds = { x: -36, y: -14, width: 72, height: 28 };
    expect(textBackground({ backgroundColor: null }, bounds)).toBeNull();
    expect(textBackground({ backgroundColor: '#ffffff', padding: 0 }, bounds)).toEqual({
      x: -36 - DEFAULT_TEXT_PADDING, y: -22, width: 88, height: 44, color: '#ffffff', radius: 0, alpha: 1,
    });
    expect(textBackground({ backgroundColor: '#000000', padding: 4, borderRadius: 3, opacity: 0.5 }, bounds))
      .toMatchObject({ x: -40, width: 80, radius: 3, alpha: 0.5 });
  });

  it('reads weight, style, rotation and scale like the renderer', () => {
    expect([textFontWeight({ bold: true }), textFontWeight({})]).toEqual(['bold', 'normal']);
    expect([textFontStyle({ italic: true }), textFontStyle({ italic: null })]).toEqual(['italic', 'normal']);
    expect(textRotation(90)).toBeCloseTo(Math.PI / 2);
    expect([textRotation(undefined), textScale(0), textScale(2)]).toEqual([0, 1, 2]);
  });
});

/**
 * Atlas's token UI files hold some of these values privately, so the shared layout keeps its own copies.
 * These tests fail when one side changes a value, and say which copy to update.
 */
describe('parity with the values the token UI renderers use', () => {
  const source = (path: string): string => readFileSync(path, 'utf8');
  const bars = source('src/app/pixi/token-renderer/resources/ResourceBarView.ts');

  it('draws a bar with the look of tokenUiLayout (BAR_STYLE, BAR_BORDER, BAR_FILL_INSET)', () => {
    expect(BAR_LOOK).toEqual({
      border: BAR_BORDER, borderColor: BAR_STYLE.border, trackColor: BAR_STYLE.inside, fillInset: BAR_FILL_INSET,
      tickColor: BAR_STYLE.tick, tickAlpha: BAR_STYLE.tickAlpha,
    });
    // The renderer writes the tick width and count inline
    expect(bars).toMatch(/width: 0\.5, color: BAR_LOOK\.tickColor/);
    expect(BAR_STYLE.tickWidth).toBe(0.5);
    expect(bars).toMatch(/for \(let i = 1; i < 10; i\+\+\)/);
    expect(BAR_TICKS).toBe(10);
  });

  it('lays bars out as barStackRects does, and darkens a defeated bar with BAR_STYLE.defeatedAlpha', () => {
    const ui = source('src/app/pixi/TokenUIRenderer.ts');
    expect(ui).toMatch(/const baseGap = 2;/);
    expect(FIRST_BAR_GAP).toBe(2);
    expect(ui).toMatch(/fill\(\{ color: 0x000000, alpha: 0\.4 \}\)/);
    expect(BAR_STYLE.defeatedAlpha).toBe(0.4);
  });

  it("draws the downed skull at DOWNED_LOOK's share and opacity", () => {
    expect(source('src/app/pixi/token-renderer/DownedTokenOverlay.ts')).toContain(`const MARKER_OPACITY = ${DOWNED_LOOK.markerOpacity};`);
    expect(source('src/app/pixi/token-renderer/downedEmblemTexture.ts')).toContain(`const SKULL_SHARE = ${DOWNED_LOOK.skullShare};`);
  });
});
