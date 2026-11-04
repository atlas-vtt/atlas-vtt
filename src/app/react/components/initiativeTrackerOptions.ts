import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { MENU_SEPARATOR } from './context-menu/AtlasContextMenu';
import { confirmAction } from '../../ui/confirmDialog';
import { runInBackground } from '../../utils/backgroundTask';
import { t } from '../../i18n';
import type { InitiativeDock } from '../../initiative/initiativeLayout';
import type { InitiativeTurnOptions } from '../../initiative/turnOptions';

interface TrackerOptionsState {
  autoSort: boolean;
  /** By sides nothing is sorted: the switch stays in place, disabled. */
  bySides: boolean;
  /** The tracker holds no combatant: there is nothing to clear. */
  empty: boolean;
  /** The GM's cards show names (Atlas' setting, the same in every scene). */
  showNames: boolean;
  /** During a fight the lists start at the turn (Atlas' setting, followed by the players' list). */
  fromTurn: boolean;
  /** The edge the tracker and the players' list stand at. */
  dock: InitiativeDock;
  /** What a turn change does (Atlas' settings). */
  turn: InitiativeTurnOptions;
  /** Online play is switched on: the switch for players' moves shows. */
  online: boolean;
}

interface TrackerOptionsActions {
  setAutoSort: (autoSort: boolean) => void;
  setShowNames: (showNames: boolean) => void;
  setFromTurn: (fromTurn: boolean) => void;
  setDock: (dock: InitiativeDock) => void;
  setTurn: (changes: Partial<InitiativeTurnOptions>) => void;
  clear: () => void;
  /** Opens the library on its tokens, whose menu adds them to the tracker beside the map. */
  addCombatant: () => void;
}

/**
 * Asks before the tracker is emptied: initiative is no undo step, so a cleared fight cannot be
 * brought back. An empty tracker is cleared without a question.
 */
export async function clearInitiativeAsking(empty: boolean, clear: () => void): Promise<void> {
  if (!empty) {
    const confirmed = await confirmAction({
      title: t('initiative.clearTitle'),
      message: [t('initiative.clearBody')],
      confirmLabel: t('initiative.clear'),
      destructive: true,
    });
    if (!confirmed) return;
  }
  clear();
}

/** The menu behind the tracker's options button: how it sorts, what its cards show, how the lists are laid out, what a turn change does, adding combatants and clearing it. */
export function initiativeTrackerOptions(state: TrackerOptionsState, actions: TrackerOptionsActions): ContextMenuEntry[] {
  return [
    {
      type: 'item',
      label: t('initiative.autoSort'),
      icon: 'arrow-down-wide-narrow',
      checked: state.autoSort,
      disabled: state.bySides,
      description: t('initiative.autoSortHint'),
      onClick: () => actions.setAutoSort(!state.autoSort),
    },
    {
      type: 'item',
      label: t('initiative.showNames'),
      icon: 'tag',
      checked: state.showNames,
      description: t('initiative.showNamesHint'),
      onClick: () => actions.setShowNames(!state.showNames),
    },
    {
      type: 'item',
      label: t('initiative.fromTurn'),
      icon: 'list-start',
      checked: state.fromTurn,
      description: t('initiative.fromTurnHint'),
      onClick: () => actions.setFromTurn(!state.fromTurn),
    },
    {
      type: 'item',
      label: t('initiative.dockLeft'),
      icon: 'panel-left',
      checked: state.dock === 'left',
      description: t('initiative.dockLeftHint'),
      onClick: () => actions.setDock(state.dock === 'left' ? 'right' : 'left'),
    },
    MENU_SEPARATOR,
    {
      type: 'item',
      label: t('initiative.turnBanner'),
      icon: 'flag',
      checked: state.turn.banner,
      description: t('initiative.turnBannerHint'),
      onClick: () => actions.setTurn({ banner: !state.turn.banner }),
    },
    {
      type: 'item',
      label: t('initiative.followTurn'),
      icon: 'locate-fixed',
      checked: state.turn.followTurn,
      description: t('initiative.followTurnHint'),
      onClick: () => actions.setTurn({ followTurn: !state.turn.followTurn }),
    },
    ...(state.online ? [{
      type: 'item' as const,
      label: t('initiative.movesOnTurn'),
      icon: 'footprints',
      checked: state.turn.movesOnTurn,
      description: t('initiative.movesOnTurnHint'),
      onClick: () => actions.setTurn({ movesOnTurn: !state.turn.movesOnTurn }),
    }] : []),
    MENU_SEPARATOR,
    {
      type: 'item',
      label: t('initiative.addCombatant'),
      icon: 'list-plus',
      description: t('initiative.addCombatantHint'),
      onClick: actions.addCombatant,
    },
    {
      type: 'item',
      label: t('initiative.clear'),
      icon: 'trash-2',
      destructive: true,
      disabled: state.empty,
      onClick: () => runInBackground(clearInitiativeAsking(state.empty, actions.clear), 'Clearing initiative'),
    },
  ];
}
