/**
 * Where a picked metric's rule card hangs on the recovery editor's stage: under the metric's row,
 * from its left edge, or over the row where the stage has no room below. Pure: every box is in px
 * of the stage's padding box.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type RuleCardSide = 'below' | 'above';

export interface RuleCardPlace {
  left: number;
  side: RuleCardSide;
  /** The y of the card's edge that faces the metric: its top below the row, its bottom above it. */
  edge: number;
}

/** Room between the metric and the card, and between the card and the stage's sides. */
export const RULE_GAP = 8;
/** How far a metric's badge rises over its top edge (half of it: recovery-stage.scss), which a card over the metric keeps clear of. */
export const BADGE_RISE = 9;

const clamp = (value: number, least: number, most: number): number => (least > most ? least : Math.max(least, Math.min(most, value)));

/**
 * The card of `width` × `height` for the metric `metric` inside the stage `frame`: `RULE_GAP`
 * under the row, from its left edge (kept inside the stage's sides), or as far over the badge on
 * its top edge where the stage has no room below. `kept` is the side the card already hangs on, which it keeps while it
 * fits there, so a card that grows does not jump. It never covers its metric.
 */
export function placeRuleCard(width: number, height: number, metric: Box, frame: Box, kept?: RuleCardSide): RuleCardPlace {
  const left = clamp(metric.left, frame.left + RULE_GAP, frame.right - RULE_GAP - width);
  const fits: Record<RuleCardSide, boolean> = {
    below: metric.bottom + RULE_GAP + height <= frame.bottom,
    above: metric.top - BADGE_RISE - RULE_GAP - height >= frame.top,
  };
  let side: RuleCardSide = !fits.below && fits.above ? 'above' : 'below';
  if (kept && fits[kept]) side = kept;
  return { left, side, edge: side === 'below' ? metric.bottom + RULE_GAP : metric.top - BADGE_RISE - RULE_GAP };
}
