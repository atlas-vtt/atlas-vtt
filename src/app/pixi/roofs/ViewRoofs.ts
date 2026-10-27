import { Matrix, type Application } from 'pixi.js';
import type { App } from 'obsidian';
import type { Viewport } from 'pixi-viewport';
import { everyLevelObjects, levelObjects } from '../../levels/levelObjects';
import { partyPlaces } from '../../levels/roofs';
import { viewedLevelId } from '../../levels/sceneLevels';
import { SightTokens } from '../../lighting/sightOnDrop';
import type { ViewAtlasStore } from '../../storeFactory';
import type { Point } from '../../types/visionTypes';
import { MOTION_SLOW_MS, prefersReducedMotion } from '../../utils/motion';
import { NO_SIGHT, type AmbientZone } from '../../vision/sight';
import type { MapBounds } from '../../vision/visibility';
import type { TileView } from '../mapImage/levelOfDetail';
import { createRoofHost } from '../lighting/belowLevelsHost';
import type { SceneFrame } from '../lighting/engine/types';
import { levelRoof, Roof, type RoofHost, type RoofLighting, type RoofScene } from '../lighting/levels/Roof';
import { PlayerView } from '../lighting/PlayerView';
import type { SceneLightingView } from '../lighting/sceneLightingView';
import type { HideableLayer } from '../playerSafeFrame';
import { addBeforeRender, BEFORE_RENDER_ORDER, requestRender } from '../RenderScheduler';
import { usesCanvasRenderer } from '../utils/rendererType';

const NO_ZONES: readonly AmbientZone[] = [];

export interface ViewRoofsDeps {
  app: Application;
  viewport: Viewport;
  store: ViewAtlasStore;
  obsApp: App;
  /** The size of the viewed level's map image once it has loaded: the roof lies on the same world. */
  mapSize: () => { width: number; height: number } | null;
  /** The viewed level's world, which the ambient light is laid on. */
  bounds: () => MapBounds | null;
  /** The view's lighting, while it has one: on a lit scene the players see a roof only where their senses do. */
  lighting: () => SceneLightingView | undefined;
  /** The roof changed what it covers: the players' view of the tokens follows. */
  onChange?: () => void;
  /** What the roof is made with; unset, the vault's images through the view's camera (`createRoofHost`). */
  host?: RoofHost;
  /** How long a piece takes to fade; unset, the motion of the canvas's window (none where it asks for reduced motion). */
  fadeMs?: number;
}

/**
 * The roof of the level a view shows (`Roof`), above its lighting: faded under the party in the
 * players' picture (their frame, session view, the peek; `modeLayer`), under the selected tokens in
 * the GM's, hidden from the GM's picture by the switcher's Roofs, whole in a picture of the scene.
 * It follows the store, and the lighting's sight before each render; the players' rule asks
 * `covers` (a token whose centre a drawn roof covers is not seen by them). PIXI's Canvas renderer
 * has no filters, so it could draw a roof neither in pieces nor faded: there no roof is drawn, and none covers.
 */
export class ViewRoofs {
  /** Visible means the players' picture: flipped by the player frame's capture, held in session view. */
  readonly modeLayer: HideableLayer;
  private readonly roof: Roof;
  private readonly sightTokens = new SightTokens();
  private readonly cleanups: Array<() => void> = [];
  /** A picture of the scene holds the roof on its own camera. */
  private held = false;
  private readonly tick = (): void => this.roof.animate(performance.now());
  /** Roofs can be drawn on this renderer. */
  private readonly drawn: boolean;
  /** What the last sync read: nothing is built anew while the store, the sight and the map's size stay. */
  private seen: readonly unknown[] = [];
  /** Counts the roof images read: one arriving is something to build. */
  private reads = 0;

  constructor(private readonly deps: ViewRoofsDeps) {
    const { app, viewport, store } = deps;
    this.roof = new Roof({
      host: deps.host ?? createRoofHost(deps.obsApp, app, viewport),
      requestRender: () => requestRender(app),
      onReady: () => {
        this.reads++;
        this.sync();
      },
      fadeMs: deps.fadeMs ?? (prefersReducedMotion(app.canvas) ? 0 : MOTION_SLOW_MS),
    });
    this.modeLayer = new PlayerView((players) => this.roof.setMode(players ? 'player' : 'gm'));
    this.roof.layer.view.onRender = (): void => this.followCamera();
    this.drawn = !usesCanvasRenderer(app.renderer);
    if (this.drawn) viewport.addChild(this.roof.layer.view);
    this.modeLayer.visible = store.getState().isPlayerView || !store.getState().isGMView;
    this.cleanups.push(
      store.subscribe((state, previous) => {
        if (state.isGMView !== previous.isGMView && !state.isPlayerView) this.modeLayer.visible = !state.isGMView;
        this.sync();
      }),
      // The lighting works its sight out after the store's write: what the roof reads of it is taken before each render.
      addBeforeRender(app, () => this.sync(), BEFORE_RENDER_ORDER.roofs),
    );
    app.ticker.add(this.tick);
    this.sync();
  }

  /** Whether a drawn roof covers `point` in the players' picture: a token there is not seen by them. */
  covers(point: Point): boolean {
    if (!this.drawn) return false;
    this.sync();
    return this.roof.coversForPlayers(point);
  }

  /** Runs `render`, a picture of the scene (a thumbnail): the roof whole and unfaded, through the frame's own camera. */
  renderForFrame<T>(frame: SceneFrame, render: () => T): T {
    const mode = this.roof.layer.currentMode;
    this.held = true;
    this.roof.setMode('picture');
    this.roof.setView(new Matrix(1, 0, 0, 1, frame.x, frame.y));
    try {
      return render();
    } finally {
      this.held = false;
      this.roof.setMode(mode);
    }
  }

  drawFor(view: TileView): () => void {
    return this.roof.drawFor(view);
  }

  addDemandRegion(view: TileView): () => void {
    return this.roof.addDemandRegion(view);
  }

  destroy(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.deps.app.ticker?.remove(this.tick);
    this.roof.destroy();
  }

  /** Updates the roof where what it is drawn from changed. */
  private sync(): void {
    if (!this.drawn) return;
    const lighting = this.deps.lighting();
    const size = this.deps.mapSize();
    const seen = [this.deps.store.getState(), lighting, lighting?.isEnabled(), lighting?.currentSight(), lighting?.sightIsCurrent(), lighting?.ambientLight(), size?.width, size?.height, this.reads];
    if (seen.every((value, i) => value === this.seen[i])) return;
    this.seen = seen;
    if (this.roof.update(this.scene())) this.deps.onChange?.();
  }

  private scene(): RoofScene {
    const state = this.deps.store.getState();
    const level = viewedLevelId(state);
    const tokens = levelObjects(state).tokens;
    const selected = state.selectedIds.flatMap((id) => (tokens[id] ? [{ x: tokens[id].x, y: tokens[id].y }] : []));
    const roof = levelRoof(state, level);
    return {
      ...roof,
      foreground: state.isMapLoading ? null : roof.foreground,
      background: this.deps.mapSize(),
      party: partyPlaces(this.sightTokens.read(state)),
      selected,
      lit: this.lighting(),
    };
  }

  /** How a lit scene's players see the roof; null while the scene is unlit or its sight is not the scene's yet. */
  private lighting(): RoofLighting | null {
    const lighting = this.deps.lighting();
    const bounds = this.deps.bounds();
    if (!lighting?.isEnabled() || !bounds) return null;
    const state = this.deps.store.getState();
    return {
      lighting: state.lighting,
      zones: lighting.ambientLight().zones ?? NO_ZONES,
      bounds,
      sight: lighting.sightIsCurrent() ? lighting.currentSight() : NO_SIGHT,
      tokens: everyLevelObjects(state).tokens,
    };
  }

  /** The filter maps the render's points to the world with the camera of the frame being drawn. */
  private followCamera(): void {
    if (this.held) return;
    const { viewport } = this.deps;
    this.roof.setView(new Matrix(viewport.scale.x, 0, 0, viewport.scale.y, viewport.x, viewport.y).invert());
  }
}
