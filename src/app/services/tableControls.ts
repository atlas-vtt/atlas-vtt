import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { tableControlsStore, type PlayMode } from '../stores/tableControlsStore';
import { PlayerWindowService } from './PlayerWindowService';

/** Lowers the curtain or lifts it, on the player window while it is open and for online players. */
export function setTableCurtain(down: boolean): void {
  tableControlsStore.setState({ curtain: down });
  PlayerWindowService.getInstance()?.setCurtain(down);
}

/** Whether the bar shows play as paused: the GM's pause, or a player window frozen another way (the palette, a key). */
export function isTablePaused(): boolean {
  const service = PlayerWindowService.getInstance();
  return tableControlsStore.getState().paused || (service !== null && service.isWindowOpen() && service.isFrozen() && !service.isTrueScale());
}

/**
 * Pauses play or lets it go on: the player window's camera freezes (not while TrueScale pins it on its
 * frame) and online players may not move their tokens until play goes on.
 */
export function setTablePaused(paused: boolean): void {
  const { online } = tableControlsStore.getState();
  tableControlsStore.setState({ paused });
  const service = PlayerWindowService.getInstance();
  if (service?.isWindowOpen() && !service.isTrueScale() && service.isFrozen() !== paused) {
    if (paused) service.freezeCamera();
    else service.unfreezeCamera();
    // Before players are shown the scene there is nothing to freeze the window on; online players are paused all the same
    if (paused && !service.isFrozen() && !online) {
      tableControlsStore.setState({ paused: false });
      showNotice(t('player.nothingToFreeze'));
      return;
    }
  }
  showNotice(t(paused ? 'player.frozen' : 'player.unfrozen'));
}

export function toggleTablePause(): void {
  setTablePaused(!isTablePaused());
}

export function setPlayMode(playMode: PlayMode): void {
  tableControlsStore.setState({ playMode });
}
