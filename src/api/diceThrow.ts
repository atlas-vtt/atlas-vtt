import type { App } from 'obsidian';
import { noteThrown, sendGivenThrow, thrownBefore } from '../app/dice3d/givenThrows';
import { updateRemoteView } from '../app/remote-view/remoteViewState';
import { SettingsService } from '../app/services/SettingsService';
import type { DiceRollResult } from '../app/tools/diceRolling';
import { frozenCopy } from './frozen';
import { isLoaded, isRemoteView } from './viewInfo';
import type { ViewTracker } from './viewTracker';

/**
 * `dice.throw`: throws `roll`, already checked to be a roll, in the map view `viewId` with Atlas's own dice. A remote
 * view throws it as one of its own rolls (`RemoteView.throwRoll`), a GM map view through its dice display; both share
 * the view's memory of thrown ids. False when nothing is thrown: no such open view, its map not loaded, the user's dice
 * shown as result cards, a roll that is not plain data, or a GM view whose dice display is not there to hear it. A roll id the view threw before is not thrown again: true.
 */
export function throwGivenRoll(app: App, views: ViewTracker | null, viewId: unknown, roll: DiceRollResult): boolean {
  const view = typeof viewId === 'string' ? views?.view(viewId) ?? null : null;
  if (!view || !isLoaded(view.atlasStore.getState())) return false;
  if ((SettingsService.forApp(app)?.getDiceDisplay() ?? 'full') === 'card') return false;
  let copy: DiceRollResult;
  try {
    copy = frozenCopy(roll);
  } catch {
    return false;
  }
  const store = view.atlasStore;
  if (thrownBefore(store, copy.id)) return true;
  if (isRemoteView(view)) {
    updateRemoteView(store, { ownRoll: copy });
  } else if (!sendGivenThrow(store, copy)) {
    // No dice display heard it (not mounted yet, or failed): the id stays free and the caller shows the roll.
    return false;
  }
  noteThrown(store, copy.id);
  return true;
}
