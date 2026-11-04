import type { EventEmitter } from 'events';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TFile, type App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import type { DiceRollOrigin } from '../types/diceRollOrigin';
import type { DiceRollResult } from '../types/diceTypes';
import type { PreparedDiceRoll } from '../react/components/dice/diceSourcePresentation';
import { PlayerDiceToasts } from '../react/components/dice/PlayerDiceToasts';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import { PlayerRollScene } from './PlayerRollScene';
import { rollForPlayers, type PlayerRollSources } from './playerRollSource';
import type { SettingsService } from './SettingsService';

/**
 * Shows the DM's dice rolls in the player window while the DM lets players see
 * them (`localPlayerView.showDiceRolls`), as the same toasts the DM gets. A roll
 * names its token only where the shown scene shows that token (`rollForPlayers`),
 * decided when it arrives.
 */
export class PlayerDiceRolls implements PlayerOverlay {
  private host: HTMLElement | undefined;
  private root: Root | undefined;
  private diceEvents: EventEmitter | undefined;
  private sourceKey = 0;
  private isShown: boolean;
  private readonly scene = new PlayerRollScene();
  private readonly unsubscribeSettings: () => void;

  constructor(private readonly app: App, private readonly settings: SettingsService) {
    this.isShown = settings.getLocalPlayerViewSettings().showDiceRolls;
    this.unsubscribeSettings = settings.onChange(({ localPlayerView }) => {
      if (localPlayerView.showDiceRolls === this.isShown) return;
      this.isShown = localPlayerView.showDiceRolls;
      this.render();
    });
  }

  mount(parent: HTMLElement): void {
    this.unmount();
    this.host = parent.createDiv({ cls: 'atlas-player-dice-rolls' });
    this.root = createRoot(this.host);
    this.render();
  }

  /** Rolls shown from another view's events start afresh; those of the same view stay, as they came. */
  present(_store: StoreApi<ViewAtlasState>, diceEvents?: EventEmitter, rollSources?: PlayerRollSources): void {
    if (this.diceEvents !== diceEvents) this.sourceKey++;
    this.diceEvents = diceEvents;
    this.scene.present(rollSources);
    this.render();
  }

  /** Rolls keep showing while the DM browses other scene tabs, named by the held picture. */
  hold(): void {
    this.scene.hold();
  }

  releaseSource(): void {
    this.diceEvents = undefined;
    this.scene.release();
    this.sourceKey++;
    this.render();
  }

  destroy(): void {
    this.diceEvents = undefined;
    this.scene.release();
    this.unsubscribeSettings();
    this.unmount();
  }

  private readonly prepare = (result: DiceRollResult, origin: DiceRollOrigin | undefined): PreparedDiceRoll =>
    rollForPlayers(result, origin, this.scene, {
      showNames: this.settings.getLocalPlayerViewSettings().showTokenNameplates,
      imageSrc: (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        return file instanceof TFile ? this.app.vault.getResourcePath(file) : null;
      },
    });

  private render(): void {
    if (!this.root || !this.host) return;
    const { app, host, diceEvents, prepare } = this;
    this.root.render(this.isShown && diceEvents ? createElement(PlayerDiceToasts, { app, container: host, eventBus: diceEvents, prepare, key: this.sourceKey }) : null);
  }

  private unmount(): void {
    this.root?.unmount();
    this.host?.remove();
    this.root = undefined;
    this.host = undefined;
  }
}
