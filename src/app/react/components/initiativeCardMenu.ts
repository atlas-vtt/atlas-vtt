import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { SIDE_LABELS, otherSide, sideOf } from '../../initiative/sides';
import type { TokenUpdates } from '../../types/viewState';
import type { TokenEntity } from '../../types';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';

interface CardMenuActions {
  roll: () => void;
  moveToFront: () => void;
  moveToBack: () => void;
  edit: () => void;
  updateToken: (changes: TokenUpdates) => void;
  setSitsOut: (sitsOut: boolean) => void;
  remove: () => void;
}

/**
 * The menu of a combatant's card. In turn order it rolls and edits the combatant's number; by
 * sides there is none, and the card moves to the other side or sits a round of the fight out.
 */
export function initiativeCardMenu(
  entry: InitiativeEntry,
  token: TokenEntity | undefined,
  mode: { bySides: boolean; fightRuns: boolean },
  actions: CardMenuActions,
): ContextMenuEntry[] {
  const hidden = token?.isHidden ?? false;
  const other = otherSide(sideOf(token));
  const item = (label: string, icon: string, onClick: () => void): ContextMenuEntry => ({ type: 'item', label, icon, onClick });

  return [
    ...(mode.bySides ? [] : [item(t('initiative.roll'), 'dice', actions.roll)]),
    item(t('initiative.toFront'), 'arrow-up-to-line', actions.moveToFront),
    item(t('initiative.toBack'), 'arrow-down-to-line', actions.moveToBack),
    ...(mode.bySides
      ? [
        item(`Move to ${SIDE_LABELS[other]}`, 'arrow-left-right', () => actions.updateToken({ side: other })),
        ...(mode.fightRuns
          ? [item(entry.sitsOut ? 'Act This Round' : 'Sit Out This Round', entry.sitsOut ? 'play' : 'pause', () => actions.setSitsOut(!entry.sitsOut))]
          : []),
      ]
      : [item(t('initiative.edit'), 'pencil', actions.edit)]),
    item(hidden ? 'Show to Players' : 'Hide from Players', hidden ? 'eye' : 'eye-off', () => actions.updateToken({ isHidden: !hidden })),
    { type: 'item', label: t('initiative.remove'), icon: 'trash-2', destructive: true, onClick: actions.remove },
  ];
}
