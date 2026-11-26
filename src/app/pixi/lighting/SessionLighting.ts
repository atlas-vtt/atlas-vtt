import type { ViewAtlasStore } from '../../storeFactory';
import { setLayerVisibility, type LayerVisibility } from '../playerSafeFrame';

export interface SessionLightingDeps {
  store: ViewAtlasStore;
  /** What a frame for the players changes about the lighting: `playerLightingLayers` of the view. */
  playerLayers: () => LayerVisibility[];
  /** The same layers as the GM sees them, by the active tool and the scene. */
  gmLayers: () => LayerVisibility[];
  /** The layers were set anew. */
  onChange: () => void;
}

/**
 * The players' lighting on the GM's own canvas: in session view (the toolbar's GM view switch
 * off) and while the peek key is held. It holds what a player frame applies for one capture,
 * read from the same list, so the canvas and the player window cannot show different lighting.
 * A capture made meanwhile finds those layers as it wants them and leaves them alone.
 */
export class SessionLighting {
  private held = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: SessionLightingDeps) {
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      if (state.isGMView !== previous.isGMView) this.sync();
    });
  }

  /** The canvas shows the players' view. */
  get active(): boolean {
    return this.held || !this.deps.store.getState().isGMView;
  }

  /** Whether the peek key holds the players' lighting on the canvas. */
  get peeking(): boolean {
    return this.held;
  }

  setPeeking(held: boolean): void {
    this.held = held;
    this.sync();
  }

  /** Sets the GM's layers and, in the players' view, the player frame's over them. */
  sync(): void {
    const { gmLayers, playerLayers, onChange } = this.deps;
    setLayerVisibility(this.active ? [...gmLayers(), ...playerLayers()] : gmLayers());
    onChange();
  }

  destroy(): void {
    this.unsubscribe();
  }
}
