/**
 * What a remote view's own UI asks of its handle, by view id: who opened it, Fit map (through the
 * view's camera) and a roll from the dice tray or the dice log (to the owner's `onRoll` listeners).
 */
import { toolbarSlot } from '../extensions/slots';
import { t } from '../i18n';

export interface RemoteControls {
  /** The id of the extension that opened the view. */
  readonly owner: string;
  fitMap(): void;
  /** Null once the owner sent the roll, else why it could not (shown in the tray). */
  roll(dice: Readonly<Record<string, number>>, modifier: number): string | null;
}

const controls = new Map<string, RemoteControls>();

/**
 * Registers the controls of the remote view `viewId`; returns the removal. Both ask the toolbar to read its items again: the
 * view's toolbar is drawn before its owner is known, and `ToolbarItem.isVisible` reads the owner (`ownRemote`).
 */
export function registerRemoteControls(viewId: string, entry: RemoteControls): () => void {
  controls.set(viewId, entry);
  toolbarSlot.invalidate();
  return () => {
    if (controls.get(viewId) !== entry) return;
    controls.delete(viewId);
    toolbarSlot.invalidate();
  };
}

/** The controls of the remote view `viewId`; null for any other view. */
export function remoteControlsOf(viewId: string | undefined): RemoteControls | null {
  return viewId === undefined ? null : controls.get(viewId) ?? null;
}

/** The id of the extension that opened the remote view `viewId`; null for any other view. */
export function remoteOwnerOf(viewId: string | undefined): string | null {
  return remoteControlsOf(viewId)?.owner ?? null;
}

/** Fits the map of the remote view `viewId`; false for any other view, which fits as a map view does. */
export function fitRemoteMap(viewId: string | undefined): boolean {
  const entry = remoteControlsOf(viewId);
  if (!entry) return false;
  entry.fitMap();
  return true;
}

/** Shown when a remote view's tray rolls with nothing to take the roll. */
export const ROLL_NOT_SENT = t('remote.rollNotSent');

/** The dice tray's roll in the remote view `viewId`: to its owner, never rolled locally. */
export function remoteTrayRoll(viewId: string | undefined): (dice: Readonly<Record<string, number>>, modifier: number) => string | null {
  return (dice, modifier) => {
    const entry = remoteControlsOf(viewId);
    return entry ? entry.roll(dice, modifier) : ROLL_NOT_SENT;
  };
}
