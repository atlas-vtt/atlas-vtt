/**
 * What a remote view shows of its owner's feed: the scene in its store (`RemoteSceneApplier`),
 * the placeholder background while the map image has no URL, the read-only initiative list, and
 * the player's part (`setPlayer`): which tokens move, the measurement, the badges, the bars. A part
 * equal by value to the one shown keeps its object.
 */
import type { App } from 'obsidian';
import type { RemoteSceneInput } from '../../api/types/remoteViews';
import type { ResourceValue } from '../resources/resourceTypes';
import { PlayerInitiativePanel } from '../services/PlayerInitiativePanel';
import type { PlayerSettingsSource } from '../services/PlayerSceneOverlay';
import type { ViewAtlasStore } from '../storeFactory';
import { RemoteMapBackdrop, type BackdropRenderer } from './RemoteMapBackdrop';
import { checkedPlayer, checkedScene } from './remoteInput';
import { RemoteSceneApplier } from './RemoteSceneApplier';
import { updateRemoteView, type RemoteViewState } from './remoteViewState';
import { sameValue } from '../utils/sameValue';

/** The parts of the remote view's state that `setPlayer` writes. */
const PLAYER_PARTS = ['movableTokenIds', 'measurement', 'conditions', 'resources', 'initiativeRules', 'initiativeHealth'] as const;
type PlayerParts = Pick<RemoteViewState, typeof PLAYER_PARTS[number]>;

/** The owner decided what the player sees before feeding it: show everything that arrives. */
const SHOW_WHAT_ARRIVES: PlayerSettingsSource = {
  getLocalPlayerViewSettings: () => ({
    showToolbar: true, showTokenNameplates: true, showNotePreviews: false,
    showGrid: true, showWidgets: true, showInitiative: true, showDiceRolls: false, showCommandPalette: false,
  }),
  onChange: () => () => undefined,
};

/** What the scene part needs of the remote map view. */
export interface RemoteSceneHost {
  readonly app: App;
  readonly viewId: string;
  readonly atlasStore: ViewAtlasStore;
  readonly containerEl: HTMLElement;
  readonly renderer: (BackdropRenderer & { getBackgroundSprite?(): { width: number; height: number; destroyed: boolean } | null }) | null;
}

export class RemoteViewScene {
  private readonly applier: RemoteSceneApplier;
  private readonly backdrop: RemoteMapBackdrop | null;
  private readonly initiative: PlayerInitiativePanel;
  private background: RemoteSceneInput['background'] | null = null;

  constructor(private readonly host: RemoteSceneHost) {
    this.applier = new RemoteSceneApplier(host.atlasStore, `remote:${host.viewId}`, (tokenId) => this.draggedTo(tokenId));
    this.backdrop = host.renderer ? new RemoteMapBackdrop(host.renderer) : null;
    this.initiative = new PlayerInitiativePanel(host.app, SHOW_WHAT_ARRIVES);
    this.initiative.mount(host.containerEl);
    this.initiative.present(host.atlasStore);
    this.showBackdrop();
  }

  setScene(input: unknown): void {
    const scene = checkedScene(input);
    try {
      this.applier.apply(scene);
    } catch (error) {
      throw new Error(`[Atlas API] RemoteView.setScene: a record could not be copied (${error instanceof Error ? error.message : String(error)}).`);
    }
    this.background = scene ? { ...scene.background } : null;
    this.showBackdrop();
    // The applier's verdict, counted once on its own copy of the fog.
    const fogTooLarge = scene !== null && this.applier.fogTooLarge;
    if (this.host.atlasStore.getState().remoteView?.fogTooLarge !== fogTooLarge) updateRemoteView(this.host.atlasStore, { fogTooLarge });
  }

  /** Writes the last scene again: a token's shown position changed (a drag ended). Reached from pointer handling, so it never throws. */
  refresh(): void {
    try {
      this.applier.refresh();
    } catch (error) {
      console.error('[Atlas API] A remote view could not write its scene again:', error);
    }
  }

  setPlayer(input: unknown): void {
    const state = checkedPlayer(input);
    const initiativeHealth: Record<string, ResourceValue> = {};
    for (const [tokenId, { value, max }] of Object.entries(state.initiative.health)) {
      Object.defineProperty(initiativeHealth, tokenId, { value: Object.freeze({ current: value, max }), enumerable: true });
    }
    const current = this.host.atlasStore.getState().remoteView;
    if (!current) return;
    const given: PlayerParts = {
      movableTokenIds: state.movableTokenIds,
      measurement: state.measurement,
      conditions: state.tokenUi.conditions,
      resources: state.tokenUi.resources,
      initiativeRules: state.initiative.rules,
      initiativeHealth: Object.freeze(initiativeHealth),
    };
    // A part equal to the one shown keeps its object, so what reads it (the initiative list, the badges) is not drawn again.
    const changed = Object.fromEntries(PLAYER_PARTS.filter((part) => !sameValue(current[part], given[part])).map((part) => [part, given[part]]));
    if (Object.keys(changed).length > 0) updateRemoteView(this.host.atlasStore, changed);
  }

  /** The map's size, for Fit map; null without a scene. */
  mapSize(): { width: number; height: number } | null {
    const background = this.background;
    if (background && background.width > 0 && background.height > 0) return { width: background.width, height: background.height };
    const sprite = this.host.renderer?.getBackgroundSprite?.() ?? null;
    return background && sprite && !sprite.destroyed ? { width: sprite.width, height: sprite.height } : null;
  }

  dispose(): void {
    this.backdrop?.dispose();
    this.initiative.destroy();
  }

  /** Where the player's drag in progress holds `tokenId`; null when it is not being dragged. */
  private draggedTo(tokenId: string): { x: number; y: number } | null {
    const state = this.host.atlasStore.getState();
    if (!state.isDragging || !state.selectedIds.includes(tokenId)) return null;
    const token = Object.hasOwn(state.objects.tokens, tokenId) ? state.objects.tokens[tokenId] : undefined;
    return token ? { x: token.x, y: token.y } : null;
  }

  private showBackdrop(): void {
    this.backdrop?.show(this.background, this.host.atlasStore.getState().grid);
  }
}
