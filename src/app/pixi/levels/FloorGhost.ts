import type { Container } from 'pixi.js';
import { sameStretch, type MapStretch } from '../../grid/mapStretch';
import { levelImagePlacement } from '../../levels/levelAlignment';
import { levelBackground } from '../../levels/levelEdits';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { BelowMapImage } from '../lighting/levels/BelowLevel';
import { MAP_LAYER_Z } from '../mapLayerOrder';

export interface FloorGhostDeps {
  /** Makes a map image drawn through the view's camera. */
  createMapImage: () => BelowMapImage;
  viewport: Container;
  store: ViewAtlasStore;
  requestRender: () => void;
}

/** How strongly the other floor shows over the floor being placed, to begin with. */
export const FLOOR_GHOST_ALPHA = 0.5;

/** What the ghost draws of a level: its map and where that lies. */
interface GhostScene {
  background: string | null;
  placement: MapStretch;
  gridSize: number | undefined;
}

function ghostScene(state: ViewAtlasState, levelId: string): GhostScene {
  return { background: levelBackground(state, levelId), placement: levelImagePlacement(state, levelId), gridSize: state.grid?.size };
}

/**
 * Another floor's map drawn see-through over the floor the GM is placing (Position floor), above its
 * map and below its grid, drawings and tokens: the stairs, walls and rooms of both are seen at once.
 * One of the GM's markers, never in the players' picture or a picture of the scene.
 */
export class FloorGhost {
  private image: BelowMapImage | null = null;
  private levelId: string | null = null;
  private shown: GhostScene | null = null;
  private readonly stopFollowing: () => void;

  constructor(private readonly deps: FloorGhostDeps) {
    this.stopFollowing = deps.store.subscribe(() => this.follow());
  }

  /** The ghost's layer while it shows. */
  get layer(): Container | null {
    return this.image?.layer ?? null;
  }

  /** Shows level `levelId`'s map as the ghost; null hides it. */
  show(levelId: string | null): void {
    if (levelId === this.levelId) return;
    this.levelId = levelId;
    this.shown = null;
    if (levelId === null) {
      this.release();
      return;
    }
    if (!this.image) {
      const image = this.deps.createMapImage();
      image.layer.zIndex = MAP_LAYER_Z.floorGhost;
      image.layer.alpha = FLOOR_GHOST_ALPHA;
      this.deps.viewport.addChild(image.layer);
      this.image = image;
    }
    this.follow();
  }

  /** How strongly the ghost shows, 0 to 1. */
  setAlpha(alpha: number): void {
    if (!this.image) return;
    this.image.layer.alpha = Math.min(1, Math.max(0, alpha));
    this.deps.requestRender();
  }

  destroy(): void {
    this.stopFollowing();
    this.release();
  }

  private follow(): void {
    const { image, levelId } = this;
    if (!image || levelId === null) return;
    const scene = ghostScene(this.deps.store.getState(), levelId);
    const previous = this.shown;
    this.shown = scene;
    if (previous && previous.background === scene.background && previous.gridSize === scene.gridSize) {
      if (!sameStretch(previous.placement, scene.placement)) image.setStretch(scene.placement);
      return;
    }
    void image.load(scene.background, scene.gridSize, scene.placement).then(() => this.deps.requestRender());
  }

  private release(): void {
    if (!this.image) return;
    this.image.layer.parent?.removeChild(this.image.layer);
    this.image.destroy();
    this.image = null;
    this.deps.requestRender();
  }
}
