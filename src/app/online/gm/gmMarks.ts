import { CursorOverlay, CursorTap, MarkOverlay, PointerTap, type CursorViewport, type MeasureRules, type OverlayHost, type RemoteDrag, type TapViewport } from '../marks/index.ts';
import { LIVE_INTERVAL_MS, type SharedCursor } from '../protocol/index.ts';
import type { HeldPlayout } from '../../pixi/token-renderer/TokenGlide';
import type { App } from 'obsidian';
import type { SceneSource } from '../../host/sceneSource';
import type { Measurements } from '../../pixi/MeasureRenderer';
import type { ViewState } from '../../types/viewState';
import { tokenFootprints, type TokenFootprint } from '../../vision/measureOrigin';
import { atlasLaserLook, field } from './atlasLighting.ts';
import { asTokenSource, call, type SceneState, type SceneStore } from './atlasView.ts';
import type { GmMarkSource, PlayerMarks } from './MarkShare.ts';
import { levelObjects } from '../../levels/levelObjects';
import { mapTokens } from '../../tokens/offMap';

type Viewport = TapViewport & CursorViewport & OverlayHost['viewport'];

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';
const hasMethods = (value: unknown, names: readonly string[]): boolean => typeof value === 'object' && value !== null && names.every((name) => isFunction(field(value, name)));

/** The renderer's measurements as data (`MeasureRenderer.measurements`, a private renderer field), or null. */
function measurementsOf(renderer: unknown): SceneSource<Measurements> | null {
  const source = field(field(renderer, 'measureRenderer'), 'measurements');
  return hasMethods(source, ['get', 'subscribe']) ? (source as SceneSource<Measurements>) : null;
}

/** Tells an Atlas tab's token renderer how to draw the tokens players drag (`TokenRenderer.setHeldPlayout`), where it can be told. */
function setHeldPlayout(tokens: unknown, playout: HeldPlayout | null): void {
  const set = field(tokens, 'setHeldPlayout');
  if (isFunction(set)) (set as (playout: HeldPlayout | null) => void).call(tokens, playout);
}

/**
 * The parts of an Atlas tab's renderer the GM's marks are read from, or null while it has no viewport
 * and canvas. Measurement records came later than the rest (public PR 345): without them the laser
 * and the players' marks still work, and the GM's measurements stay with the GM.
 */
function rendererParts(renderer: unknown): { readonly measurements: SceneSource<Measurements> | null; readonly viewport: Viewport; readonly canvas: HTMLCanvasElement; readonly tokens: unknown } | null {
  const viewport = call(renderer, 'getViewportInstance');
  const canvas = call(renderer, 'getCanvasElement');
  if (!hasMethods(viewport, ['on', 'off', 'toWorld']) || !hasMethods(canvas, ['addEventListener', 'getContext'])) return null;
  const measurements = measurementsOf(renderer);
  if (measurements === null) console.warn('Atlas Online: this Atlas build keeps no measurement records, so players do not see the GM\'s measurements. Update Atlas.');
  return { measurements, viewport: viewport as Viewport, canvas: canvas as HTMLCanvasElement, tokens: call(renderer, 'getTokenRenderer') };
}

/**
 * The GM's marks on a shared Atlas tab, read from its renderer: the measure renderer's records, a
 * `PointerTap` on its viewport for Atlas's laser (whose state is private), and what the players see of
 * the tokens (`playerRollTokens`, the token list's own source). Built anew when the tab builds its
 * renderer anew. Also draws the players' marks and the rulers of their drags over the tab (`MarkOverlay`) and their cursors
 * (`CursorOverlay`), and follows the GM's own cursor (`CursorTap`). A token a player drags is drawn as far
 * behind as that player's cursor, so the two move as one (`HeldPlayout`).
 */
export class GmMarks {
  private readonly app: App;
  /** The shared tab's renderer, or null once it is gone. */
  private readonly renderer: () => unknown;
  private readonly store: SceneStore;
  /** The player whose drag holds a token, by GM token id. */
  private readonly draggerOf: (tokenId: string) => string | undefined;
  private readonly overlay: MarkOverlay;
  private readonly cursors = new CursorOverlay((cursor) => cursor.name ?? '');
  /** What the overlay shows: the players' marks and the rulers of their drags, each kept until it changes. */
  private shown: { players: PlayerMarks; drags: readonly RemoteDrag[] } = { players: { lasers: [], measures: [] }, drags: [] };
  private built: { readonly renderer: unknown; readonly source: GmMarkSource; readonly taps: readonly { destroy(): void }[]; readonly host: OverlayHost; readonly tokens: unknown } | null = null;
  private readonly playout: HeldPlayout = {
    interval: LIVE_INTERVAL_MS,
    lag: (tokenId) => {
      const player = this.draggerOf(tokenId);
      return player === undefined ? null : this.cursors.lagOf(player);
    },
  };

  constructor(app: App, renderer: () => unknown, store: SceneStore, rules: () => MeasureRules | null, draggerOf: (tokenId: string) => string | undefined) {
    this.app = app;
    this.renderer = renderer;
    this.store = store;
    this.draggerOf = draggerOf;
    this.overlay = new MarkOverlay(rules);
  }

  /** The GM's marks, the same object while the tab's renderer is the same; null while it has none. */
  source(): GmMarkSource | null {
    const renderer = this.renderer();
    const built = this.built;
    if (built !== null && built.renderer === renderer) return built.source;
    this.release();
    const parts = rendererParts(renderer);
    if (parts === null) return null;
    const state = (): SceneState & Partial<Pick<ViewState, 'activeTool' | 'tokenSettings'>> => this.store.getState();
    const tap = new PointerTap(parts.viewport, parts.canvas, () => state().activeTool === 'laser-pointer');
    const cursor = new CursorTap(parts.viewport, parts.canvas);
    const source: GmMarkSource = {
      measurements: parts.measurements,
      laser: tap,
      cursor,
      laserLook: () => atlasLaserLook(this.app),
      footprints: () => this.footprints(parts.tokens, state()),
      seen: () => {
        const mapPath = state().mapPath;
        const shown = mapPath === null ? null : asTokenSource(this.renderer())?.playerRollTokens(mapPath);
        return (id) => shown?.has(id) === true;
      },
      onPlayersViewChange: (listener) => {
        const subscribe = field(parts.tokens, 'onPlayersViewChange');
        const stop: unknown = isFunction(subscribe) ? (subscribe as (listener: () => void) => unknown).call(parts.tokens, listener) : undefined;
        return isFunction(stop) ? () => void stop() : () => undefined;
      },
    };
    setHeldPlayout(parts.tokens, this.playout);
    this.built = { renderer, source, taps: [tap, cursor], host: { canvas: parts.canvas, viewport: parts.viewport }, tokens: parts.tokens };
    return source;
  }

  /** Draws the players' marks over the tab's map. */
  showPlayers(marks: PlayerMarks): void {
    this.shown.players = marks;
    this.showOverlay();
  }

  /** Draws the rulers of the players' drags over the tab's map. */
  showPlayerDrags(drags: readonly RemoteDrag[]): void {
    this.shown.drags = drags;
    this.showOverlay();
  }

  /** Draws the players' cursors over the tab's map. */
  showPlayerCursors(cursors: readonly SharedCursor[]): void {
    this.source();
    if (this.built !== null) this.cursors.show(cursors, this.built.host);
    else this.cursors.clear();
  }

  dispose(): void {
    this.release();
    this.overlay.dispose();
    this.cursors.dispose();
  }

  /** Lets go of the renderer's parts: its taps, and its tokens go back to gliding. */
  private release(): void {
    this.built?.taps.forEach((tap) => tap.destroy());
    if (this.built !== null) setHeldPlayout(this.built.tokens, null);
    this.built = null;
  }

  private showOverlay(): void {
    this.source();
    if (this.built !== null) this.overlay.show({ ...this.shown.players, drags: this.shown.drags }, this.built.host);
  }

  /** Where every token stands, hidden ones included, as Atlas's measurements judge their start. */
  private footprints(tokens: unknown, state: SceneState & Partial<Pick<ViewState, 'tokenSettings'>>): TokenFootprint[] {
    const sprites = call(tokens, 'getTokenSprites');
    const displayed = typeof sprites === 'object' && sprites !== null ? (sprites as Record<string, { x: number; y: number } | null>) : {};
    const size = asTokenSource(this.renderer())?.getGridOptions()?.size ?? state.grid?.size ?? 0;
    return tokenFootprints(mapTokens(levelObjects(state)), displayed, size, state.tokenSettings?.tokenRingSize ?? 1);
  }
}
