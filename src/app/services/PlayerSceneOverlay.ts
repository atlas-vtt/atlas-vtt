import type { EventEmitter } from 'events';
import type { StoreApi } from 'zustand';
import { shallow } from 'zustand/vanilla/shallow';
import type { ViewAtlasState } from '../storeFactory';
import type { AtlasSettings, SettingsService } from './SettingsService';

export type PlayerSettings = AtlasSettings['localPlayerView'];

/** Something drawn over the mirrored map in the player window. */
export interface PlayerOverlay {
  /** Draw into `parent`, the popout's content. */
  mount(parent: HTMLElement): void;
  /** Bind to the store of the presented scene. */
  present(store: StoreApi<ViewAtlasState>, diceEvents?: EventEmitter): void;
  /** Drop live subscriptions when the presented view closes. */
  releaseSource?(): void;
  /** Keep the presented scene while the DM browses other scene tabs. */
  hold(): void;
  /** Draw again: something outside the store and the player settings changed what players see. */
  refresh?(): void;
  destroy(): void;
}

/**
 * A player window overlay drawn from the presented scene's view store.
 *
 * All scene tabs of a view share one store, so while the DM browses another tab
 * it holds a different map. `hold` therefore keeps the presented scene until
 * `present` binds the overlay to a scene again. Overlays keep only the plain data
 * `select` picks, so a held overlay never keeps the store or a closed map alive.
 */
export abstract class PlayerSceneOverlay<Scene extends object> implements PlayerOverlay {
  private container: HTMLElement | undefined;
  private scene: Scene | undefined;
  private playerSettings: PlayerSettings;
  private unsubscribeStore: (() => void) | undefined;
  private readonly unsubscribeSettings: () => void;

  protected constructor(private readonly containerInfo: DomElementInfo, settings: SettingsService) {
    this.playerSettings = settings.getLocalPlayerViewSettings();
    this.unsubscribeSettings = settings.onChange(() => {
      const playerSettings = settings.getLocalPlayerViewSettings();
      if (shallow(this.playerSettings, playerSettings)) return;
      this.playerSettings = playerSettings;
      this.refresh();
    });
  }

  /**
   * Draw into a new container in `parent`, the popout's content. The scene can be
   * presented or held before the popout document has loaded.
   */
  mount(parent: HTMLElement): void {
    this.container = parent.createDiv(this.containerInfo);
    this.refresh();
  }

  /** Bind to the presented view, including when it belongs to a different Atlas leaf. */
  present(store: StoreApi<ViewAtlasState>): void {
    this.unsubscribeStore?.();
    this.scene = this.select(store.getState());
    this.refresh();
    this.unsubscribeStore = store.subscribe((state) => {
      const scene = this.select(state);
      if (shallow(this.scene, scene)) return;
      this.scene = scene;
      this.refresh();
    });
  }

  /**
   * Freeze the presented scene while the DM browses other scene tabs. Views switch
   * the active tab before loading the next map, so the kept scene is still the presented one.
   */
  hold(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = undefined;
  }

  destroy(): void {
    this.hold();
    this.unsubscribeSettings();
  }

  /** Picks the store values this overlay shows; a shallow change triggers a re-render. */
  protected abstract select(state: ViewAtlasState): Scene;

  /** Fills the emptied `container` from the presented `scene`. */
  protected abstract render(container: HTMLElement, scene: Scene, settings: PlayerSettings): void;

  refresh(): void {
    if (!this.container) return;
    this.container.empty();
    if (this.scene) this.render(this.container, this.scene, this.playerSettings);
  }
}
