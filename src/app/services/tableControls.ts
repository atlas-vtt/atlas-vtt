import { showNotice } from '../ui/notice';
import { t } from '../i18n';
import { tableControlsStore, type PlayMode } from '../stores/tableControlsStore';
import { playerWindowStore } from '../stores/playerWindowStore';
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

/** The GM chose the play mode for the table to come, or a saved table brought its own back: the player window no longer chooses it. */
let chosen = false;

export function setPlayMode(playMode: PlayMode): void {
  if (!tableControlsStore.getState().online) chosen = true;
  tableControlsStore.setState({ playMode });
}

/** A saved table's play mode, back after a reload: kept until that table ends. */
export function restorePlayMode(playMode: PlayMode): void {
  chosen = true;
  tableControlsStore.setState({ playMode });
}

/**
 * Until the GM chooses, the table to come starts with phones as remotes while the player window shows the scene
 * at the table, else with each player on their own map. A table that ends leaves the choice to the window again.
 */
export function followPlayerWindowWithPlayMode(): () => void {
  const follow = (): void => {
    if (chosen || tableControlsStore.getState().online) return;
    const playMode: PlayMode = playerWindowStore.getState().isOpen ? 'remote' : 'table';
    if (tableControlsStore.getState().playMode !== playMode) tableControlsStore.setState({ playMode });
  };
  follow();
  const offWindow = playerWindowStore.subscribe((state, previous) => {
    if (state.isOpen !== previous.isOpen) follow();
  });
  const offTable = tableControlsStore.subscribe((state, previous) => {
    if (!previous.online || state.online) return;
    chosen = false;
    follow();
  });
  return () => {
    offWindow();
    offTable();
  };
}
