import React from 'react';
import type { ActiveCondition } from '../../utils/activeConditions';
import { ConditionBadge } from '../../packages/components/shared/ConditionBadge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useInTooltipProvider } from '../../packages/components/primitives/tooltip';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';

/** How far the tooltip stands from the card: past the tracker's inset and border, and a tooltip's gap beyond. */
const TRACKER_GAP = 16;

interface CardConditionsTooltipProps {
  entryId: string;
  /** Every condition the combatant is under, whether its card shows them or not. */
  conditions: readonly ActiveCondition[];
  /** The side it opens on: away from the edge the tracker stands at. */
  side: 'left' | 'right';
  /** Kept shut, as while the card's statblock preview shows. */
  suppressed: boolean;
  children: React.ReactElement;
}

/**
 * Hovering a combatant's card names every condition it is under in one tooltip beside the tracker, centred on the card.
 * Whether it shows is the view's `conditionsShownEntry`, so the players' list shows the same (`playerConditionsTip.ts`).
 * Radix opens it after the provider's delay and closes it on leaving, a press, Escape or another tooltip opening.
 */
export function CardConditionsTooltip({ entryId, conditions, side, suppressed, children }: CardConditionsTooltipProps): React.ReactElement {
  const store = useViewStoreHook();
  const shown = useAtlasStore((state) => state.conditionsShownEntry === entryId);
  const inProvider = useInTooltipProvider();
  const onOpenChange = (open: boolean): void => {
    if (open) store.getState().showCombatantConditions(entryId);
    else store.getState().hideCombatantConditions(entryId);
  };
  const tooltip = (
    // Always wrapped, so a card that gains its first condition keeps its element
    <Tooltip disableHoverableContent open={shown && conditions.length > 0 && !suppressed} onOpenChange={onOpenChange}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align="center" sideOffset={TRACKER_GAP}>
        <ul className="atlas-initiative-conditions-tip">
          {conditions.map((condition) => (
            <li key={condition.id} className="atlas-initiative-conditions-tip__row">
              <ConditionBadge condition={condition} size={18} />
              <span className="atlas-initiative-conditions-tip__name">{condition.name}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
  // The tracker gives its cards one provider (`InitiativeTracker`); a card shown alone brings its own
  return inProvider ? tooltip : <TooltipProvider delayDuration={300}>{tooltip}</TooltipProvider>;
}
