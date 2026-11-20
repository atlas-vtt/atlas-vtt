import type { App } from 'obsidian';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../storeFactory';
import { TurnWatch } from '../initiative/banner/turnBanner';
import { FightWatch, fightBanner } from '../initiative/banner/fightWatch';
import { TurnBannerStage, type FightMove } from '../initiative/banner/turnBannerStage';
import type { TurnBanner } from '../initiative/banner/turnBanner';
import { portraitSrc } from '../utils/portraitSrc';
import type { PlayerOverlay } from './PlayerSceneOverlay';
import type { SettingsService } from './SettingsService';

/**
 * The turn banner in the player window: the players' version of the GM's, shown when the turn of
 * the presented scene's fight moves on. It follows their initiative list: none while the list is
 * not shown (the player view's switch, the GM's tracker closed), none where the list marks no
 * turn (a hidden turn holder), names as the list shows them, and none once the GM
 * switched the banner off. A scene bound anew, or one that loads, starts without a banner. With `turnBannerAtLists`
 * a banner stands just above each list instead, turned with it.
 */
export class PlayerTurnBanner implements PlayerOverlay {
  /** How the banners stand (`TurnBannerStage`), as on the online player page. */
  private readonly stage: TurnBannerStage;
  private readonly watch = new TurnWatch();
  private readonly fights = new FightWatch();
  private unsubscribe: (() => void) | undefined;

  constructor(app: App, private readonly settings: SettingsService) {
    this.stage = new TurnBannerStage((imagePath) => portraitSrc(app, imagePath));
  }

  mount(parent: HTMLElement): void {
    this.stage.mount(parent);
  }

  /** Shows the banners where the player view puts them: at every list drawn, else in the one place. */
  private show(banners: TurnBanner[], fight?: FightMove): void {
    this.stage.show(banners, {
      ...(fight !== undefined && { fight }),
      atLists: this.settings.getLocalPlayerViewSettings().turnBannerAtLists === true,
      facesPlayers: this.settings.initiativeLayout().facesPlayers,
    });
  }

  present(store: StoreApi<ViewAtlasState>): void {
    this.hold();
    this.watch.reset();
    this.fights.reset();
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
    this.stage.hide();
  }

  destroy(): void {
    this.hold();
    this.stage.destroy();
  }

  private look(state: ViewAtlasState): void {
    const localPlayerView = this.settings.getLocalPlayerViewSettings();
    // Names as the players' list shows them
    const showNames = localPlayerView.showTokenNameplates;
    const mapShowsNameplates = state.tokenSettings?.showNameplates ?? false;
    const banner = this.watch.next(state, { kind: 'players', showNames, mapShowsNameplates });
    const change = this.fights.next(state);
    const shown = localPlayerView.showInitiative && state.initiativeTrackerOpen && this.settings.initiativeTurnOptions().banner;
    if (!state.initiative?.isActive) {
      // The fight ended: its banner replaces the turn's; a turn's banner leaves with the fight
      if (change === 'ended' && shown) this.show([fightBanner('ended')], 'end');
      else if (this.stage.showing && !this.stage.showsFightEnd) this.stage.hide();
      return;
    }
    if (!shown) return;
    // A fight that starts says so at the lists, then names its first turn, which a dimming table (`turnDim`) leaves unsaid
    const named = banner && !localPlayerView.turnDim ? [banner] : [];
    if (change === 'started') this.show([fightBanner('started'), ...named], 'start');
    else if (named.length > 0) this.show(named);
    else if (banner) this.stage.dim();
  }
}
