import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { MENU_SEPARATOR } from './context-menu/AtlasContextMenu';
import { confirmAction } from '../../ui/confirmDialog';
import { runInBackground } from '../../utils/backgroundTask';
import { t } from '../../i18n';
import { PLAYERS_LIST_EDGES, toggledEdge, type InitiativeDock, type PlayersListEdge } from '../../initiative/initiativeLayout';
import type { InitiativeTurnOptions } from '../../initiative/turnOptions';

interface TrackerOptionsState {
  autoSort: boolean;
  /** By sides nothing is sorted: the switch stays in place, disabled. */
  bySides: boolean;
  /** The tracker holds no combatant: there is nothing to clear. */
  empty: boolean;
  /** The GM's cards show names (Atlas' setting, the same in every scene). */
  showNames: boolean;
  /** The GM's tracker is the compact list (Atlas' setting); it always shows names. */
  compact: boolean;
  /** During a fight the lists start at the turn (Atlas' setting, followed by the players' list). */
  fromTurn: boolean;
  /** The edge the players' list stands at (also across the top or bottom). */
  dock: PlayersListEdge;
  /**
   * Every edge the players' list stands at, and whether each copy faces its edge, as they are now: the submenu
   * stays open while the GM ticks several, so it reads them again on every change (`subscribeSettings`).
   */
  playersList: () => { edges: readonly PlayersListEdge[]; facesPlayers: boolean };
  /** Reports a change of Atlas' settings; returns the function that stops it. */
  subscribeSettings?: (onChange: () => void) => () => void;
  /** The edge the GM's tracker stands at. */
  gmDock: InitiativeDock;
  /** What a turn change does (Atlas' settings). */
  turn: InitiativeTurnOptions;
  /** Online play is switched on: the switch for players' moves shows. */
  online: boolean;
}

interface TrackerOptionsActions {
  setAutoSort: (autoSort: boolean) => void;
  setShowNames: (showNames: boolean) => void;
  setCompact: (compact: boolean) => void;
  setFromTurn: (fromTurn: boolean) => void;
  setEdges: (edges: PlayersListEdge[]) => void;
  setFacesPlayers: (on: boolean) => void;
  setGmDock: (dock: InitiativeDock) => void;
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
      label: t('initiative.showNames'),
      icon: 'tag',
      checked: state.showNames,
      description: t('initiative.showNamesHint'),
      disabled: state.compact,
      onClick: () => actions.setShowNames(!state.showNames),
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
      type: 'item',
      label: t('initiative.gmDockLeft'),
      icon: 'panel-left',
      checked: state.gmDock === 'left',
      description: t('initiative.gmDockLeftHint'),
      onClick: () => actions.setGmDock(state.gmDock === 'left' ? 'right' : 'left'),
    },
    {
      type: 'submenu',
      label: t('initiative.playersList'),
      icon: 'tv',
      // Any edges at once, for players around a table TV; the last one stays. Each tick reads the edges as they are
      // now, since the submenu stays open
      children: () => {
        const { edges, facesPlayers } = state.playersList();
        return [
          ...PLAYERS_LIST_EDGES.map((edge): ContextMenuEntry => ({
            type: 'item',
            label: t(`initiative.playersList.${edge}`),
            checked: edges.includes(edge),
            disabled: edges.length === 1 && edges[0] === edge,
            keepOpen: true,
            onClick: () => actions.setEdges(toggledEdge(state.playersList().edges, edge)),
          })),
          MENU_SEPARATOR,
          {
            type: 'item',
            label: t('initiative.playersList.faces'),
            checked: facesPlayers,
            description: t('initiative.playersList.facesHint'),
            keepOpen: true,
            onClick: () => actions.setFacesPlayers(!state.playersList().facesPlayers),
          },
        ];
      },
      ...(state.subscribeSettings && { subscribe: state.subscribeSettings }),
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
