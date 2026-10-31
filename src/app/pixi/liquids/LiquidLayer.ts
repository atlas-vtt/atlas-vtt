import { Container, type Ticker } from 'pixi.js';
import { levelObjects } from '../../levels/levelObjects';
import { liquidList } from '../../liquids/liquids';
import type { LiquidSurface } from '../../types/liquidTypes';
import type { ViewState } from '../../types/viewState';
import type { MapVideoMode } from '../mosaicCanvas/video/mapVideoPlayback';
import { destroyTree } from '../utils/destroyTree';
import { frameTime } from '../utils/animationFrames';
import { LIQUID_FPS, liquidFrameDue } from './liquidMotion';
import { LiquidMesh, type WorldBox } from './LiquidMesh';
import type { LiquidDetail } from './liquidShader';

/** How long building surfaces may take in one frame; one that takes longer is still built whole. */
const BUILD_BUDGET_MS = 6;
/** The longest step the clock takes between two frames: a stalled window resumes where it was. */
const MAX_STEP_MS = 100;

type LiquidsState = Pick<ViewState, 'objects' | 'levels' | 'viewedLevel' | 'grid'>;

export interface LiquidLayerDeps {
  store: { getState(): LiquidsState; subscribe(listener: (state: LiquidsState) => void): () => void };
  ticker: Ticker;
  /** Asks for a render: the render scheduler cannot see a shader's clock move. */
  requestRender: () => void;
  /** Whether anything of a world box may be seen now, on the canvas or in the player window. */
  inView: (box: WorldBox) => boolean;
  /** False on a renderer without WebGL: the still map shows, nothing is built. */
  drawable: boolean;
  /**
   * How many frames a second the surfaces may move at now (at most `LIQUID_FPS`; 0 holds the
   * moment shown): fewer on a device that asks the lighting for less, and zoomed far out, where
   * their detail is too fine to see move. Unset, `LIQUID_FPS`.
   */
  fps?: () => number;
  /** How much of its material each surface draws (`LiquidDetail`), by quality alone, never by zoom; unset, 2. */
  detail?: () => LiquidDetail;
  /** The time of the display frame (ms); unset, the ticker's, which every animation of the map shares (`frameTime`). */
  now?: () => number;
}

interface Built {
  /** The record's own entry, by which a change is seen. */
  entry: unknown;
  mesh: LiquidMesh;
}

/**
 * The water, lava and acid of the level a view shows, moving over its map image (`LiquidMesh`).
 * It stands right above the map, so the lighting lights it as floor, and is played by the map
 * video's rules (`setMode`): `play` moves it at most `LIQUID_FPS` times a second (`fps`) while a surface is
 * in view, `pause` holds the moment shown, `poster` shows the still moment every picture of the
 * scene shows (`stillFor`).
 */
export class LiquidLayer {
  readonly container = new Container({ label: 'liquids', eventMode: 'none', interactiveChildren: false });
  private readonly built = new Map<string, Built>();
  private pending: LiquidSurface[] = [];
  private cell = 0;
  private detail: LiquidDetail = 2;
  private record: unknown = undefined;
  private mode: MapVideoMode = 'pause';
  /** Seconds of motion, which only playing advances. */
  private seconds = 0;
  /** The moment on screen: a pause holds it, and the clock resumes from it. */
  private shownSeconds = 0;
  private shownLightTime = 0;
  private lastTick: number | null = null;
  private lastFrame: number | null = null;
  private readonly unsubscribe: () => void;
  private readonly now: () => number;
  private destroyed = false;

  constructor(private readonly deps: LiquidLayerDeps) {
    this.now = deps.now ?? ((): number => frameTime(deps.ticker));
    this.unsubscribe = deps.store.subscribe((state) => this.sync(state));
    deps.ticker.add(this.tick);
    this.sync(deps.store.getState());
  }

  setMode(mode: MapVideoMode): void {
    if (this.destroyed || mode === this.mode) return;
    this.mode = mode;
    this.lastTick = null;
    this.lastFrame = null;
    // Animation switched off shows the still moment pictures of the scene show.
    this.seconds = mode === 'poster' ? 0 : this.shownSeconds;
    this.show(this.seconds);
  }

  /** Shows the still moment for one picture of the scene (a thumbnail); returns what puts the moment shown back. */
  stillFor(): () => void {
    for (const { mesh } of this.built.values()) mesh.setTime(0);
    return (): void => {
      for (const { mesh } of this.built.values()) mesh.setTime(this.shownSeconds, this.shownLightTime);
    };
  }

  /** Builds every surface still waiting, at once (a load whose first frame must show them, tests). */
  buildPending(): void {
    this.build(Infinity);
  }

  /** Whether a surface is drawn; for tests. */
  get surfaceCount(): number {
    return this.built.size;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribe();
    this.deps.ticker.remove(this.tick);
    for (const { mesh } of this.built.values()) mesh.destroy();
    this.built.clear();
    this.pending = [];
    destroyTree(this.container);
  }

  private sync(state: LiquidsState): void {
    if (this.destroyed || !this.deps.drawable) return;
    const record = levelObjects(state).liquids;
    const cell = state.grid?.size ?? 0;
    if (record === this.record && cell === this.cell) return;
    this.record = record;
    this.cell = cell;
    const surfaces = Number.isFinite(cell) && cell > 0 ? liquidList(record) : [];
    const wanted = new Set(surfaces.map((surface) => surface.id));
    let removed = false;
    for (const [id, { entry, mesh }] of this.built) {
      if (wanted.has(id) && entry === record?.[id] && mesh.cell === cell) continue;
      mesh.destroy();
      this.built.delete(id);
      removed = true;
    }
    this.pending = surfaces.filter((surface) => !this.built.has(surface.id));
    if (this.pending.length > 0) this.build(BUILD_BUDGET_MS);
    else if (removed) this.deps.requestRender();
  }

  /** Builds waiting surfaces for up to `budget` ms (at least one), then puts every surface in its order. */
  private build(budget: number): void {
    if (this.pending.length === 0) return;
    this.followDetail();
    const start = this.now();
    const record = this.record as Record<string, unknown> | undefined;
    while (this.pending.length > 0) {
      const surface = this.pending.shift()!;
      const mesh = new LiquidMesh(surface, this.cell);
      mesh.setDetail(this.detail);
      mesh.setTime(this.shownSeconds, this.shownLightTime);
      this.built.set(surface.id, { entry: record?.[surface.id], mesh });
      if (this.now() - start >= budget) break;
    }
    // A later surface lies over an earlier one, as the record has them.
    const order = liquidList(record as Record<string, LiquidSurface> | undefined);
    this.container.removeChildren();
    for (const surface of order) {
      const built = this.built.get(surface.id);
      if (built) this.container.addChild(built.mesh.mesh);
    }
    this.deps.requestRender();
  }

  /** Shows `seconds` of motion on every surface and asks for the frame. */
  private show(seconds: number): void {
    this.shownSeconds = seconds;
    this.shownLightTime = this.mode === 'play' ? this.now() : this.mode === 'poster' ? 0 : this.shownLightTime;
    for (const { mesh } of this.built.values()) mesh.setTime(seconds, this.shownLightTime);
    if (this.built.size > 0) this.deps.requestRender();
  }

  /** Takes a new quality's detail onto every surface, paused or not, and shows it. */
  private followDetail(): void {
    const detail = this.deps.detail?.() ?? 2;
    if (detail === this.detail) return;
    this.detail = detail;
    for (const { mesh } of this.built.values()) mesh.setDetail(detail);
    this.show(this.shownSeconds);
  }

  private inView(): boolean {
    for (const { mesh } of this.built.values()) if (this.deps.inView(mesh.bounds)) return true;
    return false;
  }

  private readonly tick = (): void => {
    this.followDetail();
    if (this.pending.length > 0) this.build(BUILD_BUDGET_MS);
    if (this.mode !== 'play' || this.built.size === 0) return;
    const now = this.now();
    // The clock runs only while the surfaces play: a pause holds the moment and resumes from it.
    if (this.lastTick !== null) this.seconds += Math.min(now - this.lastTick, MAX_STEP_MS) / 1000;
    this.lastTick = now;
    const fps = this.deps.fps?.() ?? LIQUID_FPS;
    if (fps <= 0 || !liquidFrameDue(now, this.lastFrame, fps) || !this.inView()) return;
    this.lastFrame = now;
    this.show(this.seconds);
  };
}
