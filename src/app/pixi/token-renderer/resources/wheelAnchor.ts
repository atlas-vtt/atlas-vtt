import { barDimensions } from '../../../styles/designTokens';
import { CONDITION_BADGE_RADIUS } from '../ConditionBadge';
import { getTokenRingCenterRadius } from '../tokenRingMetrics';
import { computeTokenStrokeWidth, RESIZE_HANDLE_SIZE, restingTokenUIScale, tokenUIScale } from '../tokenSizing';
import { BAR_BUTTON_SIZE } from './ResourceStack';

/** What the wheels of a token must stand clear of, and how large its UI is drawn. */
export interface WheelAnchorInput {
  /** Sprite diameter of the token, in world units. */
  spriteSize: number;
  gridSize: number;
  /** The ring's size setting, which moves the resize buttons. */
  ringScale: number;
  /** World units per UI unit of the bars, nameplate and wheels: resting, selected or in between. */
  uiScale: number;
  /** Where the lowest shown bar ends below the token's bottom edge, in UI units; 0 without bars. */
  barsBottom: number;
  /** Share of the bars' +/- buttons' room to keep: 1 while the token's controls show them, 0 without. */
  barButtons: number;
  /** Half the nameplate's width, in UI units; 0 without a nameplate. */
  nameplateHalfWidth: number;
}

/**
 * Where a token's right wheels hang from, in world units from the token's centre; the left
 * wheels hang from its mirror, `-x`. Each side's wheels form one column (`wheelSlot`) whose
 * inner edge lies just outside everything beside the token: the resize button and the
 * condition badges on the ring, which scale with the token, and the bars with their buttons
 * and the nameplate, which scale with the UI. The column is centred on the span from the
 * token's top edge to the bottom of its bars, so it frames the token and its bars at any zoom.
 * The wheels and their controls both place themselves from it, so they cannot drift apart.
 */
export function wheelAnchor(input: WheelAnchorInput): { x: number; y: number } {
  const { spriteSize, gridSize, ringScale, uiScale, barsBottom, barButtons, nameplateHalfWidth } = input;
  const ringRadius = getTokenRingCenterRadius(spriteSize * ringScale, computeTokenStrokeWidth(gridSize), ringScale);
  const resizeButton = ringRadius + (RESIZE_HANDLE_SIZE / 2) * tokenUIScale(spriteSize);
  const conditionBadge = ringRadius + (CONDITION_BADGE_RADIUS + 1) * restingTokenUIScale(gridSize);
  const { width, gap } = barDimensions.token;
  const bars = barsBottom > 0 ? width / 2 + barButtons * (gap + BAR_BUTTON_SIZE) : 0;
  const belowToken = Math.max(bars, nameplateHalfWidth) * uiScale;
  return {
    x: Math.max(resizeButton, conditionBadge, belowToken),
    // Midway between the token's top edge, -spriteSize / 2, and its bars' bottom, spriteSize / 2 + barsBottom * uiScale
    y: (barsBottom * uiScale) / 2,
  };
}
