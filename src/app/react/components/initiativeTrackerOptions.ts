import type { ContextMenuEntry } from '../root/ContextMenuContext';
import { MENU_SEPARATOR } from './context-menu/AtlasContextMenu';
import { confirmAction } from '../../ui/confirmDialog';
import { runInBackground } from '../../utils/backgroundTask';
import { t } from '../../i18n';

interface TrackerOptionsState {
  /** The tracker holds no combatant: there is nothing to clear. */
  empty: boolean;
  /** The GM's tracker is the compact list (Atlas' setting); it always shows names. */
  compact: boolean;
  /** The players at the table, where the map belongs to a collection: the row adds those not in the fight yet, or opens the party to set it up. */
  party: { label: string; onClick: () => void } | null;
  /** Whether a turn change names itself in a banner (Atlas' setting). */
  banner: boolean;
}

interface TrackerOptionsActions {
  setCompact: (compact: boolean) => void;
  setBanner: (banner: boolean) => void;
  clear: () => void;
  /** Ends the fight and empties every combatant's number and conditions, keeping them in the tracker. */
  resetNumbers: () => void;
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

/**
 * The menu behind the tracker's options button: its compact view, the turn banner, adding the party or an enemy,
 * and resetting or clearing it. The list always sorts by number and starts at the turn, and the GM's view always follows
 * the turn; how the players' list is laid out is in What players see, and whether online players move only on their turn
 * in the player view's online play settings.
 */
export function initiativeTrackerOptions(state: TrackerOptionsState, actions: TrackerOptionsActions): ContextMenuEntry[] {
  return [
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
      label: t('initiative.turnBanner'),
      icon: 'flag',
      checked: state.banner,
      description: t('initiative.turnBannerHint'),
      onClick: () => actions.setBanner(!state.banner),
    },
    MENU_SEPARATOR,
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
