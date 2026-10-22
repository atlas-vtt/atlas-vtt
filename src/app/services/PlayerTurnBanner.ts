import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { TurnWatch } from '../initiative/banner/turnBanner';
import { TurnBannerDisplay } from '../initiative/banner/turnBannerElement';
import { portraitSrc } from '../utils/portraitSrc';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

/**
 * The turn banner in the player window: the players' version of the GM's, shown when the turn of
 * the presented scene's fight moves on. It follows their initiative list: none while the list is
 * not shown (the player view's switch, the GM's tracker closed), none where the list marks no
 * turn (a hidden turn holder), names only where the list shows names, and none once the GM
 * switched the banner off. A scene bound anew, or one that loads, starts without a banner.
 */
export class PlayerTurnBanner implements PlayerOverlay {
  private display: TurnBannerDisplay | undefined;
  private readonly watch = new TurnWatch();
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly app: App, private readonly settings: SettingsService) {}

  mount(parent: HTMLElement): void {
    this.display?.destroy();
    const host = parent.createDiv({ cls: 'atlas-player-turn-banner', attr: { 'aria-live': 'polite' } });
    this.display = new TurnBannerDisplay(host, (imagePath) => portraitSrc(this.app, imagePath));
  }

  present(store: StoreApi<ViewAtlasState>): void {
    this.hold();
    this.watch.reset();
    this.look(store.getState());
    this.unsubscribe = store.subscribe((state) => this.look(state));
  }

  /** While the GM browses another scene tab nothing of that tab is announced; the banner standing ends as it would. */
  hold(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  releaseSource(): void {
    this.hold();
    this.display?.hide();
  }

  destroy(): void {
    this.hold();
    this.display?.destroy();
    this.display = undefined;
  }

  private look(state: ViewAtlasState): void {
    const localPlayerView = this.settings.getLocalPlayerViewSettings();
    const banner = this.watch.next(state, { kind: 'players', showNames: localPlayerView.showTokenNameplates });
    if (!state.initiative?.isActive) {
      if (this.display?.showing) this.display.hide();
      return;
    }
    const shown = localPlayerView.showInitiative && state.initiativeTrackerOpen && this.settings.initiativeTurnOptions().banner;
    if (banner && shown) this.display?.show(banner);
  }
}
