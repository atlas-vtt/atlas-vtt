import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { sideOf } from '../../initiative/sides';
import type { TokenUpdates } from '../../types/viewState';
import type { TokenEntity } from '../../types';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import type { SideId } from '../../types/initiativeRulesTypes';
import { playerVision } from '../../characters/playerVision';
import { isOffMap } from '../../tokens/offMap';
import { t } from '../../i18n';

interface CardMenuActions {
  roll: () => void;
  moveToFront: () => void;
  moveToBack: () => void;
  edit: () => void;
  updateToken: (changes: TokenUpdates) => void;
  setSitsOut: (sitsOut: boolean) => void;
  /** Swaps the card with the combatant `withId` (a fight by cards). */
  swapCard: (withId: string) => void;
  delay: () => void;
  actNow: () => void;
  /** Puts a combatant kept beside the map on it. */
  placeOnMap: () => void;
  /** Takes the combatant out of the tracker; one kept beside the map goes with its token. */
  remove: () => void;
}

/** Moves a token to `side`; one moved to the players' side sees by default (`playerVision`), and nothing switches vision off. */
function sideChanges(token: TokenEntity | undefined, side: SideId): TokenUpdates {
  const vision = side === 'players' ? playerVision(token?.vision) : undefined;
  return vision ? { side, vision } : { side };
}

/** How the tracker runs the fight the card is in. */
export interface CardMenuMode {
  bySides: boolean;
  /** The sides a combatant may move to, in the order they act (by sides). */
  sides: readonly { id: SideId; name: string }[];
  /** A fight by cards runs: the combatant's card may be swapped with another's. */
  cards: boolean;
  fightRuns: boolean;
  /** The other combatants holding a card (a fight by cards), in the order they act. */
  swapTargets: readonly { id: string; name: string; card: number }[];
}

/**
 * The menu of a combatant's card. In turn order it rolls and edits the combatant's number; by
 * sides there is none, and the card moves to another side; in a fight by cards it swaps its card.
 * While a fight runs a combatant sits a round out, and in turn order delays its turn and acts
 * again when the GM says. A combatant kept beside the map can be placed on it.
 */
export function initiativeCardMenu(
  entry: InitiativeEntry,
  token: TokenEntity | undefined,
  mode: CardMenuMode,
  actions: CardMenuActions,
): ContextMenuEntry[] {
  const hidden = token?.isHidden ?? false;
  const current = sideOf(token, mode.sides.map((side) => side.id));
  const item = (label: string, icon: string, onClick: () => void): ContextMenuEntry => ({ type: 'item', label, icon, onClick });
  const sitOut = entry.sitsOut
    ? item(t('initiative.actThisRound'), 'play', () => actions.setSitsOut(false))
    : item(t('initiative.sitOut'), 'pause', () => actions.setSitsOut(true));
  const delay = entry.delayed
    ? item(t('initiative.actNow'), 'step-forward', actions.actNow)
    : item(t('initiative.delay'), 'hourglass', actions.delay);

  const moveTo = (side: SideId): void => actions.updateToken(sideChanges(token, side));
  const others = mode.sides.filter((side) => side.id !== current);
  // Of two sides the move goes to the other at once; of more, the GM picks one
  const moveToLabel = (side: { id: SideId; name: string }): string => {
    if (side.id === 'players') return t('initiative.moveToPlayers');
    if (side.id === 'opponents') return t('initiative.moveToOpponents');
    return t('initRules.moveTo', { side: side.name });
  };
  const moveToSide: ContextMenuEntry = others.length === 1
    ? item(moveToLabel(others[0]!), 'arrow-left-right', () => moveTo(others[0]!.id))
    : {
      type: 'submenu',
      label: t('initRules.moveToSide'),
      icon: 'arrow-left-right',
      children: others.map((side): ContextMenuEntry => ({ type: 'item', label: side.name, onClick: () => moveTo(side.id) })),
    };
  const swapCard: ContextMenuEntry = {
    type: 'submenu',
    label: t('initRules.swapCard'),
    icon: 'repeat',
    children: mode.swapTargets.map((other): ContextMenuEntry => ({
      type: 'item',
      label: other.name,
      detail: String(other.card),
      onClick: () => actions.swapCard(other.id),
    })),
  };
  const numbered = !mode.bySides && !mode.cards;

  return [
    ...(numbered ? [item(t('initiative.roll'), 'dice', actions.roll)] : []),
    item(t('initiative.toFront'), 'arrow-up-to-line', actions.moveToFront),
    item(t('initiative.toBack'), 'arrow-down-to-line', actions.moveToBack),
    ...(mode.bySides ? [moveToSide] : []),
    ...(numbered ? [item(t('initiative.edit'), 'pencil', actions.edit)] : []),
    ...(mode.cards && entry.card !== undefined && mode.swapTargets.length > 0 ? [swapCard] : []),
    ...(mode.fightRuns ? [sitOut, ...(numbered ? [delay] : [])] : []),
    ...(isOffMap(token) ? [item(t('initiative.placeOnMap'), 'map-pin', actions.placeOnMap)] : []),
    item(hidden ? t('initiative.showToPlayers') : t('initiative.hideFromPlayers'), hidden ? 'eye' : 'eye-off', () => actions.updateToken({ isHidden: !hidden })),
    { type: 'item', label: t('initiative.remove'), icon: 'trash-2', destructive: true, onClick: actions.remove },
  ];
}
