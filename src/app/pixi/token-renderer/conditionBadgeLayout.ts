/**
 * Where condition badges sit on a token's ring, and their size. Used by
 * `ConditionBadge` and `ConditionBadgeRing`, and part of the shared drawing contract; no PIXI imports.
 */
export const CONDITION_BADGE = {
  /** Badge radius in UI units (a medium token is 62 wide). */
  radius: 6,
  /** Dark rim that separates the badge from any token art or map behind it. */
  bezelWidth: 1,
  bezelColor: 0x111114,
  /** Value pip radius as a share of the badge radius, and where its centre sits. */
  pipShare: 0.6,
  pipOffset: 0.72,
  pipColor: 0x1c1c22,
  /** The "+3" badge that counts the conditions that do not fit. */
  overflowColor: 0x3a3a42,
} as const;

/** The badges fan out around the token's upper left, clear of the instance number at the upper right. */
const ARC_CENTRE = -0.75 * Math.PI;
/** The quarter between the rotate handle at the top and the resize handle on the left. */
const ARC_SPAN = Math.PI / 2;
/** Badge diameter including its bezel, in UI units. */
const BADGE_DIAMETER = (CONDITION_BADGE.radius + CONDITION_BADGE.bezelWidth) * 2;
/** Distance between the centres of neighbouring badges, in UI units. */
const BADGE_PITCH = BADGE_DIAMETER + 1.5;
const MAX_SLOTS = 6;

function stepAngle(ringRadius: number, scale: number): number {
  return ringRadius > 0 ? (BADGE_PITCH * scale) / ringRadius : ARC_SPAN;
}

/**
 * How many badges fit between the handles on a ring `ringRadius` world units from the
 * token centre, with badges `scale` world units per UI unit; on medium tokens that is three.
 */
export function badgeSlots(ringRadius: number, scale: number): number {
  const step = stepAngle(ringRadius, scale);
  const badgeAngle = step * (BADGE_DIAMETER / BADGE_PITCH);
  return Math.max(1, Math.min(MAX_SLOTS, Math.floor((ARC_SPAN - badgeAngle) / step) + 1));
}

/** The items shown as badges; when more than fit, all but the last slot, which counts the rest (`overflow`). */
export function fitBadges<T>(items: readonly T[], ringRadius: number, scale: number): { shown: T[]; overflow: number } {
  const slots = badgeSlots(ringRadius, scale);
  if (items.length <= slots) return { shown: [...items], overflow: 0 };
  const shown = items.slice(0, slots - 1);
  return { shown, overflow: items.length - shown.length };
}

/** Badge centres relative to the token centre: the first nearest the top, the rest following down the token's left. */
export function badgePositions(count: number, ringRadius: number, scale: number): Array<{ x: number; y: number }> {
  const step = stepAngle(ringRadius, scale);
  const middle = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => {
    const angle = ARC_CENTRE + (middle - index) * step;
    return { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius };
  });
}
