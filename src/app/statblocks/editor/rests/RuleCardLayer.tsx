import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS, PANEL_ENTER_MS, PANEL_EXIT_MS } from '../../../utils/motion';
import { useElementHeight } from '../../../react/hooks/useElementHeight';
import { RuleCard, type RuleCardProps } from './RuleCard';
import { placeRuleCard, type Box, type RuleCardSide } from './rulePlacement';

/** The card's width (recovery-card.scss). */
export const RULE_CARD_WIDTH = 368;
/** The card's border, above and below its content ($border-width-m). */
const CARD_BORDERS = 3;

interface RuleCardLayerProps {
  metricBox: Box;
  frame: Box;
  card: RuleCardProps;
  /** How far down the stage the card reaches while it hangs below its row, so the stage holds it; null once it is not. */
  onReach: (bottom: number | null) => void;
}

/** The panel's motion, out of the row the card hangs from (a few px towards it) and back. */
function cardMotion(side: RuleCardSide, still: boolean): React.ComponentProps<typeof motion.div> {
  const towards = side === 'below' ? -4 : 4;
  return {
    initial: still ? { opacity: 0 } : { opacity: 0, y: towards, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1, transition: { duration: still ? 0 : PANEL_ENTER_MS / 1000, ease: EASE_OUT_CONTROL_POINTS } },
    exit: still ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: towards / 2, scale: 0.98, transition: { duration: PANEL_EXIT_MS / 1000, ease: EASE_OUT_CONTROL_POINTS } },
  };
}

/**
 * The rule card where it hangs from the picked metric's row: under it from its left edge, or over
 * it where the stage has no room below, and never on it. Its height follows the chosen kind's
 * fields, as a real height (no scale), from the edge that faces the row. A press on it stays on it:
 * the stage would take it for a press beside the metric.
 */
export function RuleCardLayer({ metricBox, frame, card, onReach }: RuleCardLayerProps): React.ReactElement {
  const [content, height] = useElementHeight<HTMLDivElement>();
  const ref = useRef<HTMLDivElement>(null);
  const [kept, setKept] = useState<RuleCardSide>();
  const still = useReducedMotion() ?? false;
  const place = placeRuleCard(RULE_CARD_WIDTH, (height ?? 0) + CARD_BORDERS, metricBox, frame, kept);
  // The side it hangs on stays while the card fits there
  useLayoutEffect(() => setKept(place.side), [place.side]);
  // A card on its way out leaves the stage's height to the next one
  const present = useIsPresent();
  const reach = present && place.side === 'below' && height !== null ? place.edge + height + CARD_BORDERS : null;
  useLayoutEffect(() => {
    if (present) onReach(reach);
  }, [onReach, reach, present]);
  useLayoutEffect(() => () => onReach(null), [onReach]);

  // The card opens by the metric, which may be near the bottom of the dialog: it comes into view,
  // and again once a kind with more fields has grown it
  const intoView = (): void => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  };
  useEffect(intoView, [still]);

  const anchor = place.side === 'below'
    ? { top: place.edge }
    : { bottom: frame.bottom - place.edge };

  return (
    <motion.div ref={ref} className="atlas-rc-card-layer" data-side={place.side} style={{ left: place.left, ...anchor }}
      {...cardMotion(place.side, still)} onPointerDown={(event) => event.stopPropagation()}>
      <motion.div className="atlas-rc-card" initial={false} animate={{ height: height === null ? 'auto' : height + CARD_BORDERS }}
        transition={{ duration: still ? 0 : PANEL_ENTER_MS / 1000, ease: EASE_OUT_CONTROL_POINTS }} onAnimationComplete={intoView}>
        <div ref={content}>
          <RuleCard {...card} />
        </div>
      </motion.div>
    </motion.div>
  );
}
