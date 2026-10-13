import type { ViewAtlasStore } from '../../storeFactory';
import type { ExploredEdit } from '../../lighting/exploredEdits';
import type { AmbientLight, LightReach, Sight } from '../../vision/sight';
import type { HideableLayer } from '../playerSafeFrame';
import type { SceneFrame } from './engine/types';
import type { LightingUnavailable } from './LightingRenderer';
import type { SceneLightingView } from './sceneLightingView';

export interface LightingViewHostDeps {
  store: ViewAtlasStore;
  /** PIXI draws with Canvas 2D, which has no shaders: the fallback from the start, for good. */
  canvasRenderer: boolean;
  /** The GPU engine's view; it calls `onUnavailable` once when it cannot light the map, and has stopped by then. */
  createEngineView: (onUnavailable: (reason: LightingUnavailable) => void) => SceneLightingView;
  createFallback: () => SceneLightingView;
  /** Drops the device's note of an attempt on the view's map that never finished. */
  forgetAttempt: () => void;
  /** Tells the GM that line of sight stands in for dynamic lighting; `canRetry` when switching it off and on tries again. */
  notify: (canRetry: boolean) => void;
  /** The view was swapped: sight and light now come from another one. */
  onSightChange?: () => void;
}

/** The switch to the players' view the map view holds on to, whichever view draws at the moment. */
class ModeLayer implements HideableLayer {
  private shown = false;

  constructor(private readonly current: () => SceneLightingView) {}

  get visible(): boolean {
    return this.shown;
  }

  set visible(shown: boolean) {
    this.shown = shown;
    this.current().modeLayer.visible = shown;
  }
}

/**
 * The scene lighting of one map view, on the GPU engine while the graphics device can run it
 * and on the line-of-sight fallback when it cannot. Everything outside talks to this one
 * object, so the players' view (captured or held in session view) and the sight the tokens are
 * checked against carry over when the view behind it is swapped.
 *
 * The engine's view is replaced when it reports itself unavailable: `failed` (its shaders do
 * not compile here, or a pass threw) for the rest of this view's life, `unfinished` (its last
 * attempt on this map never drew a frame, so it may have crashed the graphics process) until
 * the GM switches dynamic lighting off, which forgets that attempt and brings the engine back.
 * A map load brings the engine back too, but forgets nothing: every load passes through
 * lighting off, and the engine's attempt on the map that arrives decides again.
 */
export class LightingViewHost implements SceneLightingView {
  readonly modeLayer: HideableLayer = new ModeLayer(() => this.view);
  private view: SceneLightingView;
  /** The fallback stands in for an unfinished attempt, not for an engine that failed. */
  private heldBack = false;
  /** The map whose unfinished attempt the GM was last told about, so a reload does not say it again. */
  private toldAbout: string | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: LightingViewHostDeps) {
    this.view = deps.canvasRenderer ? deps.createFallback() : this.startEngine();
    this.unsubscribe = deps.store.subscribe((state, previous) => {
      if (!this.heldBack) return;
      if (state.isMapLoading) {
        if (!previous.isMapLoading) this.bringEngineBack();
      } else if (previous.lighting.enabled && !state.lighting.enabled) {
        // Only the GM switches lighting off outside a load: the attempt is theirs to repeat.
        this.toldAbout = null;
        this.deps.forgetAttempt();
        this.bringEngineBack();
      }
    });
  }

  isEnabled(): boolean { return this.view.isEnabled(); }
  currentSight(): Sight { return this.view.currentSight(); }
  sightIsCurrent(): boolean { return this.view.sightIsCurrent(); }
  lightReaches(): LightReach[] { return this.view.lightReaches(); }
  ambientLight(): AmbientLight { return this.view.ambientLight(); }
  refreshBounds(): void { this.view.refreshBounds(); }
  resetExplored(): void { this.view.resetExplored(); }
  editExplored(edit: ExploredEdit): boolean { return this.view.editExplored(edit); }
  beforeMapUnload(): void { this.view.beforeMapUnload(); }

  /** An engine that fails while it prepares the frame is replaced during the call: the picture is then the fallback's. */
  renderForFrame<T>(frame: SceneFrame, render: () => T): T {
    const view = this.view;
    return view.renderForFrame(frame, () => (this.view === view ? render() : this.view.renderForFrame(frame, render)));
  }

  destroy(): void {
    this.unsubscribe();
    this.view.destroy();
  }

  /** The engine's view, or the fallback when the engine gives up while it is being constructed. */
  private startEngine(): SceneLightingView {
    const start: { done: boolean; gaveUp: LightingUnavailable | null } = { done: false, gaveUp: null };
    const view = this.deps.createEngineView((reason) => {
      if (start.done && this.view === view) this.replace(this.fallbackAfter(reason));
      else start.gaveUp = reason;
    });
    start.done = true;
    if (!start.gaveUp) return view;
    const fallback = this.fallbackAfter(start.gaveUp);
    this.release(view);
    return fallback;
  }

  private fallbackAfter(reason: LightingUnavailable): SceneLightingView {
    this.heldBack = reason === 'unfinished';
    if (this.heldBack) {
      const { mapPath } = this.deps.store.getState();
      if (mapPath !== this.toldAbout) this.deps.notify(true);
      this.toldAbout = mapPath;
    } else {
      // A failure Atlas handled is no crash: the next session may try, and will be told again.
      this.deps.forgetAttempt();
      this.deps.notify(false);
    }
    return this.deps.createFallback();
  }

  private bringEngineBack(): void {
    this.heldBack = false;
    this.replace(this.startEngine());
  }

  /** The next view is in place, with the player mode of the last, before the last is destroyed. */
  private replace(next: SceneLightingView): void {
    const last = this.view;
    this.view = next;
    next.modeLayer.visible = this.modeLayer.visible;
    this.release(last);
    this.deps.onSightChange?.();
  }

  /**
   * Destroys a view that was replaced. This runs inside a store notification or a tick: a view
   * that cannot even be torn down (a world dropped halfway) must not throw into it.
   */
  private release(view: SceneLightingView): void {
    try {
      view.destroy();
    } catch (error) {
      console.error('Atlas: could not release the replaced lighting view', error);
    }
  }
}
