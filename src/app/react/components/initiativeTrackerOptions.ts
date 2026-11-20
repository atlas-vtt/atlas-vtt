import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { MENU_SEPARATOR } from './context-menu/AtlasContextMenu';
import { confirmAction } from '../../ui/confirmDialog';
import { runInBackground } from '../../utils/backgroundTask';
import { t } from '../../i18n';
import { PLAYERS_LIST_SHAPES, type PlayersListShape } from '../../initiative/initiativeLayout';
import type { InitiativeTurnOptions } from '../../initiative/turnOptions';

interface TrackerOptionsState {
  autoSort: boolean;
  /** By sides nothing is sorted: the switch stays in place, disabled. */
  bySides: boolean;
  /** The tracker holds no combatant: there is nothing to clear. */
  empty: boolean;
  /** The GM's tracker is the compact list (Atlas' setting); it always shows names. */
  compact: boolean;
  /** During a fight the lists start at the turn (Atlas' setting, followed by the players' list). */
  fromTurn: boolean;
  /** How the players' list is laid out: a column down the right edge, or a row on each side of a table TV. */
  playersList: PlayersListShape;
  /** The players at the table, where the map belongs to a collection: the row adds those not in the fight yet, or opens the party to set it up. */
  party: { label: string; onClick: () => void } | null;
  /** What a turn change does (Atlas' settings). */
  turn: InitiativeTurnOptions;
  /** Online play is switched on: the switch for players' moves shows. */
  online: boolean;
}

interface TrackerOptionsActions {
  setAutoSort: (autoSort: boolean) => void;
  setCompact: (compact: boolean) => void;
  setFromTurn: (fromTurn: boolean) => void;
  setPlayersList: (shape: PlayersListShape) => void;
  setTurn: (changes: Partial<InitiativeTurnOptions>) => void;
  clear: () => void;
  /** Ends the fight and empties every combatant's number and conditions, keeping them in the tracker. */
  resetNumbers: () => void;
  /** Opens the library on its tokens: opening one there adds it to the tracker beside the map. */
  addCombatant: () => void;
  /** Adds an enemy without a token, named by number. */
  addEnemy: () => void;
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
      label: t('initiative.compact'),
      icon: 'list',
      checked: state.compact,
      description: t('initiative.compactHint'),
      onClick: () => actions.setCompact(!state.compact),
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
      type: 'submenu',
      label: t('initiative.playersList'),
      icon: 'tv',
      children: (Object.keys(PLAYERS_LIST_SHAPES) as PlayersListShape[]).map((shape): ContextMenuEntry => ({
        type: 'item',
        label: t(`initiative.playersList.${shape}`),
        checked: state.playersList === shape,
        description: t(`initiative.playersList.${shape}Hint`),
        onClick: () => actions.setPlayersList(shape),
      })),
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
    ...(state.party ? [{
      type: 'item' as const,
      label: state.party.label,
      icon: 'users',
      onClick: state.party.onClick,
    }] : []),
    {
      type: 'item',
      label: t('initiative.addEnemy'),
      icon: 'swords',
      description: t('initiative.addEnemyHint'),
      onClick: actions.addEnemy,
    },
    {
      type: 'item',
      label: t('initiative.resetNumbers'),
      icon: 'rotate-ccw',
      description: t('initiative.resetNumbersHint'),
      disabled: state.empty,
      onClick: actions.resetNumbers,
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
