import { BAR_SLOTS, type ResourceValue } from '../../../resources/resourceTypes';
import { barDimensions } from '../../../styles/designTokens';
import type { ResourceSlot } from './ResourceStack';

/** Diameter of the wheel, in UI units: two bar heights. */
export const WHEEL_SIZE = 20.4;
/** Space between the two wheels of a side, in UI units. */
const WHEEL_GAP = 1.6;
/** Space between an anchor and its wheels, in UI units: as wide as between a bar and its buttons. */
const WHEEL_MARGIN = barDimensions.token.gap;
/** Wheels on each side of the token. */
const WHEELS_PER_SIDE = 2;

/**
 * Where the wheel of `slot` sits, in the units of its side's anchor (`wheelAnchor`): the
 * first two wheel slots on the token's right, the next two on its left, as a mirror. A
 * side's two wheels form a column centred on its anchor, the first of the side the upper
 * one. A wheel keeps its own place even when the other slot is empty.
 */
export function wheelSlot(key: string, slot: number): ResourceSlot {
  const index = slot - BAR_SLOTS;
  const onLeft = index >= WHEELS_PER_SIDE;
  const upper = index % WHEELS_PER_SIDE === 0;
  return {
    key,
    kind: onLeft ? 'wheel-left' : 'wheel',
    left: onLeft ? -WHEEL_MARGIN - WHEEL_SIZE : WHEEL_MARGIN,
    top: upper ? -WHEEL_GAP / 2 - WHEEL_SIZE : WHEEL_GAP / 2,
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
  };
}

/** A whole maximum from two up to this many points is divided into one segment per point. */
export const MAX_WHEEL_SEGMENTS = 8;
const TOP = -Math.PI / 2;
const TURN = Math.PI * 2;

/** How a wheel shows a value, in radians clockwise from the top. */
export interface WheelGauge {
  /** Filled share of the ring, 0 to 1. */
  share: number;
  /** Where the fill ends. */
  end: number;
  /** Where the ring is divided, one tick per segment boundary; none for a ring that is not divided. */
  ticks: number[];
}

/**
 * The gauge of a wheel showing `value`, or null without a maximum. `current` counts in the
 * resource's own direction, so the filled share is `current / max` for draining and filling alike.
 */
export function wheelGauge({ current, max }: ResourceValue): WheelGauge | null {
  if (!(max > 0)) return null;
  const share = Math.max(0, Math.min(1, current / max));
  const segmented = Number.isInteger(max) && max > 1 && max <= MAX_WHEEL_SEGMENTS;
  return {
    share,
    end: TOP + TURN * share,
    ticks: segmented ? Array.from({ length: max }, (_, i) => TOP + (TURN / max) * i) : [],
  };
}

/** The top of the ring, where its fill starts. */
export const WHEEL_START = TOP;
