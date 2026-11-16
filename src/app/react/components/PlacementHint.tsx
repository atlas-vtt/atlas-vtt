import React, { useSyncExternalStore } from 'react';
import type { PlacementHand } from '../../pixi/tokenPlacement/placementHand';
import { useAtlasUI } from '../root/AtlasUIContext';
import { t } from '../../i18n';
import './placement-hint.scss';

const NOTHING_TO_FOLLOW = (): (() => void) => () => undefined;

/** How many spawned tokens are in the GM's hand on `hand`'s view, followed as it changes; 0 without a view. */
export function usePlacementHandSize(hand: PlacementHand | null): number {
  return useSyncExternalStore(hand?.subscribe ?? NOTHING_TO_FOLLOW, () => hand?.size ?? 0);
}

/**
 * While spawned tokens are in the GM's hand (`TokenPlacer`), one line above the toolbar says how to put them down and
 * how to put them away; with more than one, also that Shift places them one at a time. It goes when the last is down
 * or the rest put away. Read out once as it appears; it takes no pointer, so it never stands in the way of a click.
 */
export function PlacementHint(): React.ReactElement {
  const { renderer } = useAtlasUI();
  const size = usePlacementHandSize(renderer?.placementHand ?? null);
  return (
    <div className="atlas-bottom-toolbar-row__above" aria-live="polite">
      {size > 0 && <div className="atlas-placement-hint">{t(size > 1 ? 'token.placeHintMany' : 'token.placeHint')}</div>}
    </div>
  );
}
