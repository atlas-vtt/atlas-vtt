/**
 * The fog's picture: the committed coverage of the level shown, and a stroke under way on it,
 * drawn on one Canvas-backed sprite that every picture of the map shows at its own opacity, the
 * players' too: a stroke is drawn on it only where the players may see it at once (what hides,
 * and the brush). An edit of the fog fades from the picture before it to the new one (`FogFade`).
 */
import * as PIXI from 'pixi.js';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from '../../storeFactory';
import type { FogBounds, FogOperation } from '../../types/fogTypes';
import { HARD_FOG_EDGE, type FogEdge } from '../../fog/fogEdge';
import { fogPictureStep } from '../../fog/fogFade';
import type { FogCoverageCache } from '../../fog/FogCoverageCache';
import { DEFAULT_GM_FOG_OPACITY } from '../../fog/gmFogOpacity';
import type { MapRect } from '../../grid/cellNumbering';
import { levelObjects } from '../../levels/levelObjects';
import { levelMapKey } from '../../levels/sceneLevels';
import { prefersReducedMotion } from '../../utils/motion';
import type { LayerVisibility } from '../playerSafeFrame';
import { requestRender } from '../RenderScheduler';
import { FogCanvasCompositor } from './FogCanvasCompositor';
import { FogEdgeMesh } from './fogEdgeMesh';
import { FogFade } from './FogFade';
import { fogBoundsChanged, fogCanvasBounds } from './fogBounds';
import { changedCanvasRect, changedFogBox, MAX_FADED_PIXELS, unitedCanvasRect, type CanvasRect } from './fogChangedRect';
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
  /** Whether the canvas shows the players' view where the store's view switches do not say so (a peek); unset or null, they alone say it. */
  readonly showsPlayers?: () => boolean | null;
  /** A fade ended: fog that faded away no longer needs showing. */
  readonly onFadeEnd?: () => void;
}

export class FogPicture {
  /** What the fog code shows and hides; the edge's mesh draws in its place while the fog has an edge. */
  readonly sprite: PIXI.Sprite;
  private texture: PIXI.Texture;
  private readonly compositor: FogCanvasCompositor;
  /** Draws the fog's edge, and the fog while it fades; there only while the fog has an edge or fades. */
  private edgeMesh: FogEdgeMesh | null = null;
  private edge: FogEdge = HARD_FOG_EDGE;
  /** How opaque the fog is in the GM's view (`setGmOpacity`). */
  private gmOpacity = DEFAULT_GM_FOG_OPACITY;
  private readonly fade: FogFade;
  /** The fog the canvas shows, and the map and level it is of; null before the first picture, and once the canvas was cleared or sized anew. */
  private shown: { readonly fog: Readonly<Record<string, FogOperation>>; readonly key: string | null } | null = null;
  /** The canvas shows a stroke under way, or the fog that came of one in the task that ended it. */
  private stroke: 'none' | 'shown' | 'settling' = 'none';
  /** Whether the fog could be drawn the last time; where it could not, the canvas is covered. */
  private rendered = true;

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
    this.fade = new FogFade({
      step: () => {
        this.edgeMesh?.setMix(this.fade.mix);
        // A uniform of the mesh's shader is invisible to the scene graph
        requestRender(deps.app);
      },
      switched: () => this.edgeMesh?.setMix(this.fade.mix),
      changed: () => this.followFade(),
      ended: () => {
        deps.onFadeEnd?.();
        requestRender(deps.app);
      },
    });
  }

  /** Whether the fog is fading from the picture before an edit to the one it has now. */
  get fading(): boolean {
    return this.fade.running;
  }

  /** Whether the canvas shows a stroke under way on the fog. */
  get showsStroke(): boolean {
    return this.stroke === 'shown';
  }

  /** Whether there is fog to show: some in the scene, fog still fading away, or the cover of fog that cannot be drawn. */
  get hasFog(): boolean {
    return Object.keys(viewedFog(this.deps.store.getState())).length > 0 || !this.rendered || this.fade.running;
  }

  /** How the fog's edge looks, in every picture of the map. */
  setEdge(edge: FogEdge): void {
    // The picture a fade comes from has the edge that goes
    this.fade.end();
    this.edge = edge;
    this.compositor.setEdgeWidth(edge.width, this.deps.mapRect);
    this.followFade();
    this.drawCommitted();
  }

  /** How opaque the fog is in the GM's view, as the GM set it for this device. */
  setGmOpacity(opacity: number): void {
    if (opacity === this.gmOpacity) return;
    this.gmOpacity = opacity;
    this.followView();
  }

  /** The canvas shows another view (the GM's, the session's, a peek): the fog takes that view's opacity. */
  followView(): void {
    const alpha = this.alpha();
    if (alpha === this.sprite.alpha) return;
    this.sprite.alpha = alpha;
    // The edge's shader applies the sprite's opacity itself, which the scene graph does not see
    requestRender(this.deps.app);
  }

  /**
   * Draws the fog as the scene holds it; false where its geometry cannot be drawn and the canvas
   * is covered instead. An `edit` of the fog the picture shows fades from that picture to the new
   * one; anything else is shown at once (`fogPictureStep`).
   */
  drawCommitted(edit = false): boolean {
    const state = this.deps.store.getState();
    const fog = viewedFog(state);
    const key = levelMapKey(state.mapPath, state);
    const canMix = this.canMix();
    const step = fogPictureStep({
      edit,
      continues: this.shown !== null && this.shown.key === key,
      sameFog: this.shown?.fog === fog,
      stroke: this.stroke !== 'none',
      canMix,
      reducedMotion: canMix && prefersReducedMotion(this.deps.app.canvas),
    });
    if (step === 'cut') this.fade.end();
    else if (step === 'fade' && this.shown) this.beginFade(this.shown.fog, fog);
    this.rendered = this.compositor.composite(fog);
    // Fog that cannot be drawn covers the map at once
    if (!this.rendered) this.fade.end();
    this.shown = { fog, key };
    this.settleStroke();
    this.textureChanged();
    return this.rendered;
  }

  /** Ends a fade at once: the fog shows as the canvas holds it. */
  endFade(): void {
    this.fade.end();
  }

  /**
   * Draws the fog with a stroke under way on it (its shapes, where it takes several), also where
   * the scene holds no fog yet; without one, the fog alone.
   */
  drawStroke(stroke: FogOperation | readonly FogOperation[] | undefined): void {
    this.sprite.visible = true;
    this.compositor.composite(viewedFog(this.deps.store.getState()), stroke);
    // The stroke is live: what comes of it is on the canvas already and has nothing to fade from
    this.stroke = stroke !== undefined && ('kind' in stroke || stroke.length > 0) ? 'shown' : 'none';
    this.textureChanged();
  }

  /** Sizes the canvas to the map as it is shown now. */
  fit(): void {
    const bounds = this.bounds();
    if (!fogBoundsChanged(bounds, this.compositor.getBounds())) return;
    this.fade.end();
    this.shown = null;
    this.compositor.updateBounds(bounds);
    this.edgeMesh?.releaseFog();
    if (!this.texture.destroyed) this.texture.destroy(true);
    this.texture = PIXI.Texture.from(this.compositor.getCanvas());
    this.sprite.texture = this.texture;
    this.sprite.position.set(bounds.x, bounds.y);
    this.sprite.width = bounds.width;
    this.sprite.height = bounds.height;
  }

  /** Clears the pixels of a map that is no longer shown; the shapes others read stay. */
  clear(): void {
    this.fade.end();
    this.shown = null;
    this.stroke = 'none';
    this.compositor.clearCanvas();
  }

  /**
   * Local player captures share the GM's renderer but must not share its fog opacity. A fade is
   * part of their picture as it is of the GM's: the same mix, at their opacity.
   */
  playerLayers(): LayerVisibility[] {
    return [{ layer: this.sprite, visible: this.sprite.visible, alpha: 1 }];
  }

  /**
   * The fog as translucent as the GM view shows it, also while the canvas is in session view or a
   * peek: for a picture of the scene, which shows the fog as a fade will leave it.
   */
  gmLayers(): LayerVisibility[] {
    const alpha = resolveFogPreviewAlpha({ isPlayerView: false, isGMView: true, gmOpacity: this.gmOpacity });
    return [{ layer: this.sprite, visible: this.sprite.visible, alpha }, ...(this.fade.running ? [{ layer: this.fade, visible: false }] : [])];
  }

  destroy(): void {
    this.fade.end();
    this.edgeMesh?.destroy();
    this.edgeMesh = null;
    this.compositor.destroy();
    if (!this.texture.destroyed) this.texture.destroy(true);
  }

  /** How opaque the fog is drawn on this canvas now: as the players see it while it shows their view, a peek included. */
  private alpha(): number {
    const { isPlayerView, isGMView } = this.deps.store.getState();
    return resolveFogPreviewAlpha({ isPlayerView, isGMView: isGMView && this.deps.showsPlayers?.() !== true, gmOpacity: this.gmOpacity });
  }

  /** Two pictures are mixed by the mesh's shader, which needs WebGL: elsewhere a change shows at once. */
  private canMix(): boolean {
    const renderer: { readonly name?: string } | undefined = this.deps.app.renderer;
    return renderer?.name === 'webgl';
  }

  /**
   * The fog fades from what the canvas shows to what is drawn on it next: the part of it where
   * the two will differ is kept as it is. A change too large to keep shows at once, and one that
   * lies off the canvas changes nothing of the picture.
   */
  private beginFade(shown: Readonly<Record<string, FogOperation>>, next: Readonly<Record<string, FogOperation>>): void {
    const rect = this.changedRect(shown, next);
    if (!rect) return;
    // A fade that runs goes on from what it shows, so it keeps what it kept and the new change
    const kept = this.fade.rect ? unitedCanvasRect(this.fade.rect, rect) : rect;
    if (kept.width * kept.height > MAX_FADED_PIXELS) this.fade.end();
    else this.fade.start(this.compositor.getCanvas(), rect);
  }

  /** Where on the canvas the fog of `next` differs from that of `shown`; null where nowhere. */
  private changedRect(shown: Readonly<Record<string, FogOperation>>, next: Readonly<Record<string, FogOperation>>): CanvasRect | null {
    const box = changedFogBox(shown, next);
    if (!box) return null;
    const { width, height } = this.compositor.getCanvas();
    return changedCanvasRect(box, { bounds: this.compositor.getBounds(), scale: CANVAS_SCALE, width, height, reach: this.edge.width, map: this.deps.mapRect() });
  }

  /**
   * The mesh draws the fog while it has an edge or fades, and mixes in the picture a fade comes
   * from; a hard-edged sprite that does not fade draws itself. On a renderer without WebGL the
   * sprite draws the canvas' blur, so every edge is soft.
   */
  private followFade(): void {
    const { source, rect } = this.fade;
    if ((this.edge.width > 0 || source) && this.canMix()) {
      if (this.edgeMesh) this.edgeMesh.setEdge(this.edge);
      else this.edgeMesh = new FogEdgeMesh(this.sprite, this.edge);
      const { width, height } = this.compositor.getCanvas();
      this.edgeMesh.fadeFrom(source && rect ? { source, rect: [rect.x / width, rect.y / height, rect.width / width, rect.height / height], cut: this.fade.cutsBefore } : null);
      this.edgeMesh.setMix(this.fade.mix);
    } else {
      this.edgeMesh?.destroy();
      this.edgeMesh = null;
    }
  }

  /**
   * A stroke that ended is written in one task, sometimes as several writes (areas over cells that
   * do not touch): the fog of each is what the stroke showed, so none of them fades.
   */
  private settleStroke(): void {
    if (this.stroke !== 'shown') return;
    this.stroke = 'settling';
    queueMicrotask(() => { if (this.stroke === 'settling') this.stroke = 'none'; });
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
