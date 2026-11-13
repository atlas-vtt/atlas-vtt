/**
 * The fog's picture: the committed coverage of the level shown, and a stroke under way on it,
 * drawn on one Canvas-backed sprite that every picture of the map shows at its own opacity.
 */
import * as PIXI from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import type { FogEdge } from '../../fog/fogEdge';
import type { FogCoverageCache } from '../../fog/FogCoverageCache';
import { DEFAULT_GM_FOG_OPACITY } from '../../fog/gmFogOpacity';
import type { MapRect } from '../../grid/cellNumbering';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import type { LayerVisibility } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import { FogCanvasCompositor } from './FogCanvasCompositor';
import { FogEdgeMesh } from './fogEdgeMesh';
import { fogBoundsChanged, fogCanvasBounds } from './fogBounds';
import { resolveFogPreviewAlpha } from './fogVisibilityPolicy';

const EMPTY_FOG: Readonly<Record<string, FogOperation>> = Object.freeze({});
/** Canvas pixels per world pixel. */
const CANVAS_SCALE = 0.5;

/** The fog of the level the view shows. */
export function viewedFog(state: ViewAtlasState): Readonly<Record<string, FogOperation>> {
  return levelObjects(state)?.fog ?? EMPTY_FOG;
}

export interface FogPictureDeps {
  /** The fog's layer, which the picture's sprite joins. */
  readonly layer: PIXI.Container;
  readonly app: PIXI.Application;
  readonly store: StoreApi<ViewAtlasState>;
  /** The map image in world space, read whenever the canvas is sized. */
  readonly mapRect: () => MapRect | null;
  /** The committed shapes, shared with whoever asks what the fog covers. */
  readonly coverage: FogCoverageCache;
}

export class FogPicture {
  /** What the fog code shows and hides; the edge's mesh draws in its place while the fog has an edge. */
  readonly sprite: PIXI.Sprite;
  private texture: PIXI.Texture;
  private readonly compositor: FogCanvasCompositor;
  /** Draws the fog's edge; there only while the fog has one. */
  private edgeMesh: FogEdgeMesh | null = null;
  /** How opaque the fog is in the GM's view (`setGmOpacity`). */
  private gmOpacity = DEFAULT_GM_FOG_OPACITY;

  constructor(private readonly deps: FogPictureDeps) {
    const bounds = this.bounds();
    this.compositor = new FogCanvasCompositor(bounds, CANVAS_SCALE, deps.coverage, () => levelMapKey(deps.store.getState().mapPath, deps.store.getState()));
    this.texture = PIXI.Texture.from(this.compositor.getCanvas());
    this.sprite = new PIXI.Sprite(this.texture);
    this.sprite.position.set(bounds.x, bounds.y);
    this.sprite.width = bounds.width;
    this.sprite.height = bounds.height;
    this.sprite.alpha = this.alpha();
    this.sprite.visible = false;
    this.sprite.eventMode = 'none';
    this.sprite.zIndex = 999;
    deps.layer.addChild(this.sprite);
  }

  /** How the fog's edge looks, in every picture of the map. */
  setEdge(edge: FogEdge): void {
    this.compositor.setEdgeWidth(edge.width, this.deps.mapRect);
    // The mesh's shader needs WebGL: elsewhere the sprite draws the canvas' blur, and every edge is soft
    if (edge.width > 0 && this.deps.app.renderer.name === 'webgl') {
      if (this.edgeMesh) this.edgeMesh.setEdge(edge);
      else this.edgeMesh = new FogEdgeMesh(this.sprite, edge);
    } else {
      this.edgeMesh?.destroy();
      this.edgeMesh = null;
    }
    this.drawCommitted();
  }

  /** How opaque the fog is in the GM's view, as the GM set it for this device. */
  setGmOpacity(opacity: number): void {
    if (opacity === this.gmOpacity) return;
    this.gmOpacity = opacity;
    this.followView();
    // The edge's shader applies the sprite's opacity itself, which the scene graph does not see
    requestRender(this.deps.app);
  }

  /** The canvas shows another view (GM or session): the fog takes that view's opacity. */
  followView(): void {
    this.sprite.alpha = this.alpha();
  }

  /** Draws the fog as the scene holds it; false where its geometry cannot be drawn and the canvas is covered instead. */
  drawCommitted(): boolean {
    const rendered = this.compositor.composite(viewedFog(this.deps.store.getState()));
    this.textureChanged();
    return rendered;
  }

  /** Draws the fog with a stroke under way on it, also where the scene holds no fog yet; without one, the fog alone. */
  drawStroke(stroke: FogOperation | undefined): void {
    this.sprite.visible = true;
    this.compositor.composite(viewedFog(this.deps.store.getState()), stroke);
    this.textureChanged();
  }

  /** Sizes the canvas to the map as it is shown now. */
  fit(): void {
    const bounds = this.bounds();
    if (!fogBoundsChanged(bounds, this.compositor.getBounds())) return;
    this.compositor.updateBounds(bounds);
    if (!this.texture.destroyed) this.texture.destroy(true);
    this.texture = PIXI.Texture.from(this.compositor.getCanvas());
    this.sprite.texture = this.texture;
    this.sprite.position.set(bounds.x, bounds.y);
    this.sprite.width = bounds.width;
    this.sprite.height = bounds.height;
  }

  /** Clears the pixels of a map that is no longer shown; the shapes others read stay. */
  clear(): void {
    this.compositor.clearCanvas();
  }

  /** Local player captures share the GM's renderer but must not share its fog opacity. */
  playerLayers(): LayerVisibility[] {
    return [{ layer: this.sprite, visible: this.sprite.visible, alpha: 1 }];
  }

  /** The fog as translucent as the GM view shows it, also while the canvas is in session view: for a picture of the scene. */
  gmLayers(): LayerVisibility[] {
    return [{ layer: this.sprite, visible: this.sprite.visible, alpha: resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true, gmOpacity: this.gmOpacity }) }];
  }

  destroy(): void {
    this.edgeMesh?.destroy();
    this.edgeMesh = null;
    this.compositor.destroy();
    if (!this.texture.destroyed) this.texture.destroy(true);
  }

  /** How opaque the fog is drawn on this canvas now. */
  private alpha(): number {
    const { isPlayerView, isGMView } = this.deps.store.getState();
    return resolveFogPreviewAlpha({ isPlayerView, isGMView, gmOpacity: this.gmOpacity });
  }

  private bounds(): FogBounds {
    return fogCanvasBounds(this.deps.mapRect(), levelObjects(this.deps.store.getState())?.fog);
  }

  private textureChanged(): void {
    if (this.texture.destroyed) return;
    this.texture.source.update();
    // New pixels in an existing texture are invisible to the scene graph
    requestRender(this.deps.app);
  }
}
