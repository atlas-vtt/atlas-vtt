import React, { useSyncExternalStore } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, ListOrdered } from 'lucide-react';
import type { PlacementHand } from '../../pixi/tokenPlacement/placementHand';
import { Button } from '../../packages/components/primitives/button';
import { ToolButton } from '../../packages/components/primitives/ToolButton';
import { TooltipProvider } from '../../packages/components/primitives/tooltip';
import { useCoarsePointer } from '../../platform/useCoarsePointer';
import { MOTION_FAST_MS, PANEL_ENTER_MS, easeOut } from '../../utils/motion';
import { useAtlasUI } from '../root/AtlasUIContext';
import { t } from '../../i18n';
import './placement-hint.scss';

const NOTHING_TO_FOLLOW = (): (() => void) => () => undefined;

/** How many spawned tokens are in the GM's hand on `hand`'s view, followed as it changes; 0 without a view. */
export function usePlacementHandSize(hand: PlacementHand | null): number {
  return useSyncExternalStore(hand?.subscribe ?? NOTHING_TO_FOLLOW, () => hand?.size ?? 0);
}

/** Whether the tokens in hand are put down one by one without Shift, followed as it changes. */
function useOneByOne(hand: PlacementHand | null): boolean {
  return useSyncExternalStore(hand?.subscribe ?? NOTHING_TO_FOLLOW, () => hand?.oneByOne ?? false);
}

/**
 * While spawned tokens are in the GM's hand (`TokenPlacer`), one line above the toolbar says how to put them down and
 * how to put them away; with more than one, also that Shift places them one at a time. It goes when the last is down
 * or the rest put away. Read out once as it appears; it takes no pointer, so it never stands in the way of a click.
 * A finger has neither Shift nor Escape: under a coarse pointer the line is a strip of buttons instead (`PlacementStrip`).
 */
export function PlacementHint(): React.ReactElement {
  const { renderer } = useAtlasUI();
  const hand = renderer?.placementHand ?? null;
  const size = usePlacementHandSize(hand);
  const coarse = useCoarsePointer();
  return (
    <div className="atlas-bottom-toolbar-row__above" aria-live="polite">
      {coarse
        ? <PlacementStrip hand={hand} size={size} />
        : size > 0 && <div className="atlas-placement-hint">{t(size > 1 ? 'token.placeHintMany' : 'token.placeHint')}</div>}
    </div>
  );
}

interface PlacementStripProps {
  hand: PlacementHand | null;
  size: number;
}

/**
 * What Shift, the wheel and Escape are to a keyboard, for a finger: how many tokens are in hand, a switch that puts
 * them down one by one (the queue Shift holds), the queue's next and the one before (Shift and the wheel), and Done,
 * which puts the rest away. With one token in hand the queue's buttons stay, disabled, so Done never moves.
 */
export function PlacementStrip({ hand, size }: PlacementStripProps): React.ReactElement {
  const oneByOne = useOneByOne(hand);
  const reduced = useReducedMotion();
  const rise = reduced ? 0 : 8;
  const several = size > 1;
  const cycles = several && oneByOne;
  return (
    <AnimatePresence>
      {hand && size > 0 && (
        <motion.div
          key="placement-strip"
          role="toolbar"
          aria-label={t('token.placing')}
          className="atlas-vtt-toolbar atlas-placement-strip"
          initial={{ opacity: 0, y: rise }}
          animate={{ opacity: 1, y: 0, transition: { duration: PANEL_ENTER_MS / 1000, ease: easeOut } }}
          exit={{ opacity: 0, transition: { duration: MOTION_FAST_MS / 1000, ease: easeOut } }}
        >
          <TooltipProvider delayDuration={300}>
            <span className="atlas-placement-strip__count">{t('count.tokens', { count: size })}</span>
            <ToolButton icon={ListOrdered} label={t('token.placeOneByOne')} isActive={cycles} pressed={cycles} disabled={!several} onClick={() => hand.setOneByOne(!oneByOne)} />
            <ToolButton icon={ChevronLeft} label={t('token.placePrevious')} isActive={false} disabled={!cycles} onClick={() => hand.cycle(-1)} />
            <ToolButton icon={ChevronRight} label={t('token.placeNext')} isActive={false} disabled={!cycles} onClick={() => hand.cycle(1)} />
            <Button variant="toolbar" className="atlas-placement-strip__done" onClick={() => hand.done()}>{t('common.done')}</Button>
          </TooltipProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
